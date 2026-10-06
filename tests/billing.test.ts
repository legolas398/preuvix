import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import request from 'supertest';
import Stripe from 'stripe';
import sharp from 'sharp';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';
import { hash } from '../server/integrity';

const resources: { directory: string; store: Store }[] = [];
const origin = 'http://localhost:3000';
const password = 'billing-test-password-only';
const secret = 'whsec_fixture';
const sdk = new Stripe('sk_test_fixture');
function fixture(enabled = true) {
  const directory = mkdtempSync(path.join(tmpdir(), 'preuvix-billing-'));
  writeFileSync(
    path.join(directory, 'attestation-ed25519.pem'),
    generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  );
  const config = readConfig({
    PRIVATE_PROTOTYPE: 'false', // Existing billing unit tests use a mocked Stripe client, never real payments.
    OWNER_PASSWORD: password,
    APP_ORIGIN: origin,
    DATA_DIR: directory,
    MAX_STORAGE_MB: '10',
    PREMIUM_STORAGE_MB: '20',
    ...(enabled
      ? {
          STRIPE_SECRET_KEY: 'sk_test_fixture',
          STRIPE_WEBHOOK_SECRET: secret,
          STRIPE_PRICE_ID: 'price_fixture',
        }
      : {}),
  });
  const store = new Store(directory);
  resources.push({ directory, store });
  const price = {
    id: 'price_fixture',
    active: true,
    livemode: false,
    currency: 'eur',
    type: 'recurring',
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
    billing_scheme: 'per_unit',
    unit_amount: 1099,
    tax_behavior: 'inclusive',
  };
  const state = {
    workspace: '',
    creates: 0,
    customerCreates: 0,
    reads: 0,
    fail: false,
    subscriptions: [] as Record<string, unknown>[],
    sessions: [] as Record<string, unknown>[],
    checkoutParams: {} as Record<string, unknown>,
    portalCustomer: '',
  };
  const client = {
    prices: { retrieve: async () => price },
    customers: {
      create: async (params: { metadata: { preuvix_workspace: string } }) => {
        state.customerCreates++;
        state.workspace = params.metadata.preuvix_workspace;
        return { id: 'cus_fixture' };
      },
    },
    subscriptions: {
      list: async () => {
        state.reads++;
        if (state.fail) throw new Error('offline');
        return { data: state.subscriptions, has_more: false };
      },
    },
    checkout: {
      sessions: {
        list: async () => ({ data: state.sessions, has_more: false }),
        create: async (params: Record<string, unknown>) => {
          state.creates++;
          state.checkoutParams = params;
          const session = {
            id: 'cs_fixture',
            status: 'open',
            url: 'https://checkout.stripe.com/c/pay/fixture',
            metadata: params.metadata,
          };
          state.sessions.push(session);
          return session;
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params: { customer: string }) => {
          state.portalCustomer = params.customer;
          return { url: 'https://billing.stripe.com/p/session/fixture' };
        },
      },
    },
    webhooks: sdk.webhooks,
  } as unknown as Stripe;
  const app = createApp(config, store, undefined, client);
  const agent = request.agent(app);
  const login = () => agent.post('/api/login').set('Origin', origin).send({ password }).expect(200);
  const checkout = () =>
    agent.post('/api/billing/checkout').set('Origin', origin).send({ expectedAmount: 1099 });
  const notify = (
    type: string,
    options: { id?: string; customer?: string; live?: boolean; signature?: string } = {},
  ) => {
    const payload = JSON.stringify({
      id: options.id || `evt_${randomUUID()}`,
      object: 'event',
      type,
      livemode: options.live ?? false,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'sub_fixture', customer: options.customer || 'cus_fixture' } },
    });
    const signature =
      options.signature ?? sdk.webhooks.generateTestHeaderString({ payload, secret });
    return request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);
  };
  const active = (status = 'active', priceId = 'price_fixture') => {
    state.subscriptions = [
      {
        id: 'sub_fixture',
        customer: 'cus_fixture',
        status,
        livemode: false,
        cancel_at_period_end: false,
        metadata: { preuvix_workspace: state.workspace },
        items: { data: [{ price: { id: priceId } }] },
      },
    ];
  };
  return { config, store, app, agent, login, checkout, state, price, notify, active };
}
after(() => {
  for (const { store, directory } of resources) {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('disabled billing displays agreed monthly price and cannot charge; secrets stay private', async () => {
  const f = fixture(false);
  const plan = await request(f.app).get('/api/billing/plan').expect(200);
  assert.equal(plan.body.enabled, false);
  assert.equal(plan.body.unitAmount, 1099);
  assert.equal(plan.body.interval, 'month');
  assert.equal(plan.body.currency, 'eur');
  await request(f.app).get('/api/billing/status').expect(401);
  await f.login();
  await f.checkout().expect(503);
  const config = await f.agent.get('/api/config').expect(200);
  assert.equal(JSON.stringify(config.body).includes('sk_'), false);
});

test('checkout requires authentication, same origin, agreed amount and an EUR monthly fixed price', async () => {
  const f = fixture();
  await request(f.app)
    .post('/api/billing/checkout')
    .set('Origin', origin)
    .send({ expectedAmount: 1099 })
    .expect(401);
  await f.login();
  await f.agent.post('/api/billing/checkout').send({ expectedAmount: 1099 }).expect(403);
  await f.agent
    .post('/api/billing/checkout')
    .set('Origin', origin)
    .send({ expectedAmount: 1 })
    .expect(409);
  await f.agent
    .post('/api/billing/checkout')
    .set('Origin', origin)
    .send({ expectedAmount: 1099, price: 'price_attacker' })
    .expect(400);
  f.price.currency = 'usd';
  await f.checkout().expect(503);
  f.price.currency = 'eur';
  f.price.recurring.interval = 'year';
  await f.checkout().expect(503);
  f.price.recurring.interval = 'month';
  f.price.unit_amount = 1200;
  await f.checkout().expect(503);
  assert.equal(f.state.creates, 0);
});

test('concurrent checkout retries reuse a customer and session; billing portal is bound to owner', async () => {
  const f = fixture();
  await f.login();
  const [a, b] = await Promise.all([f.checkout().expect(200), f.checkout().expect(200)]);
  assert.equal(a.body.url, b.body.url);
  assert.equal(f.state.customerCreates, 1);
  assert.equal(f.state.creates, 1);
  assert.deepEqual(f.state.checkoutParams.line_items, [{ price: 'price_fixture', quantity: 1 }]);
  assert.equal(f.state.checkoutParams.success_url, `${origin}/?billing=success#billing`);
  const beforePayment = await f.agent.get('/api/billing/status?billing=success').expect(200);
  assert.equal(beforePayment.body.premium, false);
  await f.agent
    .post('/api/billing/portal')
    .set('Origin', origin)
    .send({ customer: 'cus_attacker' })
    .expect(200);
  assert.equal(f.state.portalCustomer, 'cus_fixture');
  f.active();
  await f.checkout().expect(409);
  assert.equal(f.state.creates, 1);
});

test('signed webhooks reconcile current status, deduplicate delivery and reject forgery/mode mismatch', async () => {
  const f = fixture();
  await f.login();
  await f.checkout().expect(200);
  f.active();
  await f.notify('customer.subscription.updated', { signature: 'invalid' }).expect(400);
  assert.equal(f.store.db.prepare('SELECT premium FROM billing_accounts').get()!.premium, 0);
  await f.notify('customer.subscription.updated', { live: true }).expect(400);
  await f.notify('customer.subscription.updated', { customer: 'cus_other' }).expect(200);
  assert.equal(f.store.db.prepare('SELECT premium FROM billing_accounts').get()!.premium, 0);
  await f.notify('checkout.session.completed', { id: 'evt_once' }).expect(200);
  const reads = f.state.reads;
  await f.notify('checkout.session.completed', { id: 'evt_once' }).expect(200);
  assert.equal(f.state.reads, reads);
  let status = await f.agent.get('/api/billing/status').expect(200);
  assert.equal(status.body.premium, true);
  assert.equal(status.body.maxStorageMb, 20);
  // A late deletion notification cannot revoke a currently active subscription.
  await f.notify('customer.subscription.deleted').expect(200);
  assert.equal(f.store.db.prepare('SELECT premium FROM billing_accounts').get()!.premium, 1);
  f.active('past_due');
  await f.notify('invoice.payment_failed').expect(200);
  status = await f.agent.get('/api/billing/status').expect(200);
  assert.equal(status.body.premium, false);
  assert.equal(status.body.maxStorageMb, 10);
  f.active('active', 'price_unrelated');
  await f.notify('customer.subscription.updated').expect(200);
  assert.equal(f.store.db.prepare('SELECT premium FROM billing_accounts').get()!.premium, 0);
});

test('failed webhook reconciliation remains retryable and paid capacity is enforced on uploads', async () => {
  const f = fixture();
  await f.login();
  await f.checkout().expect(200);
  f.active();
  f.state.fail = true;
  await f.notify('customer.subscription.updated', { id: 'evt_retry' }).expect(503);
  assert.equal(
    f.store.db.prepare('SELECT id FROM billing_events WHERE id=?').get('evt_retry'),
    undefined,
  );
  f.state.fail = false;
  await f.notify('customer.subscription.updated', { id: 'evt_retry' }).expect(200);
  f.store.usedBytes = () => 11 * 1024 * 1024;
  const photo = await sharp({
    create: { width: 32, height: 24, channels: 3, background: '#dba070' },
  })
    .jpeg()
    .toBuffer();
  const upload = () =>
    f.agent
      .post('/api/proofs')
      .set('Origin', origin)
      .field('title', 'Billing quota test')
      .field('source', 'upload')
      .field('requestKey', randomUUID())
      .field('clientSha256', hash(photo))
      .attach('file', photo, 'photo.jpg');
  await upload().expect(201);
  f.active('canceled');
  await f.notify('customer.subscription.deleted').expect(200);
  await upload().expect(413);
  assert.equal(f.store.list().length, 1); // A downgrade never removes an existing proof.
});

test('live keys cannot be activated without explicit live, HTTPS and secure-cookie settings', () => {
  const env = {
    OWNER_PASSWORD: password,
    STRIPE_SECRET_KEY: 'sk_live_fixture',
    STRIPE_PRICE_ID: 'price_fixture',
    STRIPE_WEBHOOK_SECRET: secret,
  };
  assert.throws(() => readConfig(env), /Live billing/);
  assert.throws(() => readConfig({ ...env, STRIPE_ALLOW_LIVE: 'true' }), /Live billing/);
});

test('workspace load refreshes old entitlements and an expired cache never grants Premium during an outage', async () => {
  const f = fixture();
  await f.login();
  await f.checkout().expect(200);
  f.active();
  f.store.db.prepare('UPDATE billing_accounts SET checked_at=0').run();
  const refreshed = await f.agent.get('/api/config').expect(200);
  assert.equal(refreshed.body.maxStorageMb, 20);
  f.state.fail = true;
  f.store.db.prepare('UPDATE billing_accounts SET checked_at=0').run();
  const expired = await f.agent.get('/api/config').expect(200);
  assert.equal(expired.body.maxStorageMb, 10);
});
