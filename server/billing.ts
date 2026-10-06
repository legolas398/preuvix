import Stripe from 'stripe';
import express, { type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config';
import type { Store } from './store';
import type { BillingPlan, BillingStatus } from '../shared/billing';
import { PREMIUM_MONTHLY_CENTS } from '../shared/billing';

type Account = {
  mode: string;
  id: string;
  customer: string | null;
  status: string;
  premium: number;
  cancel_at_end: number;
  attempt: string;
  checked_at: number;
};
export class BillingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createBilling(config: Config, store: Store, client?: Stripe) {
  const settings = config.stripe;
  const enabled =
    !config.privatePrototype &&
    Boolean(settings.secretKey && settings.webhookSecret && settings.priceId);
  const stripe =
    client ??
    (enabled ? new Stripe(settings.secretKey, { maxNetworkRetries: 2, timeout: 15000 }) : null);
  const mode = settings.live ? 'live' : 'test';
  store.db
    .exec(`CREATE TABLE IF NOT EXISTS billing_accounts (mode TEXT PRIMARY KEY, id TEXT NOT NULL, customer TEXT, status TEXT NOT NULL DEFAULT 'none', premium INTEGER NOT NULL DEFAULT 0, cancel_at_end INTEGER NOT NULL DEFAULT 0, attempt TEXT NOT NULL, checked_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS billing_events (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL);`);
  store.db
    .prepare('INSERT OR IGNORE INTO billing_accounts(mode,id,attempt) VALUES (?,?,?)')
    .run(mode, randomUUID(), randomUUID());
  const account = () =>
    store.db.prepare('SELECT * FROM billing_accounts WHERE mode=?').get(mode) as Account;
  // This application runs one server process over one private workspace/database.
  // Serialize remote reads and writes so overlapping events cannot overwrite newer state.
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = tail.then(run, run);
    tail = next.catch(() => undefined);
    return next;
  }
  function requireStripe() {
    if (!enabled || !stripe)
      throw new BillingError(503, 'La facturation Stripe n’est pas encore configurée.');
    return stripe;
  }
  function localStatus(): BillingStatus {
    const row = account();
    // Do not grant indefinite paid storage from an old cache if notifications stop.
    const premium =
      enabled && Boolean(row.premium) && row.checked_at > Date.now() - 24 * 60 * 60_000;
    return {
      status: row.status,
      premium,
      canManage: enabled && Boolean(row.customer),
      cancelAtPeriodEnd: Boolean(row.cancel_at_end),
      maxStorageMb: premium ? settings.premiumStorageMb : config.maxStorageMb,
    };
  }
  async function readPrice(): Promise<BillingPlan> {
    const base = {
      enabled,
      testMode: !settings.live,
      currency: 'eur' as const,
      interval: 'month' as const,
      premiumStorageMb: settings.premiumStorageMb,
    };
    if (!enabled) return { ...base, unitAmount: PREMIUM_MONTHLY_CENTS, taxBehavior: 'unspecified' };
    const price = await requireStripe().prices.retrieve(settings.priceId);
    if (
      !price.active ||
      price.livemode !== settings.live ||
      price.currency !== 'eur' ||
      price.type !== 'recurring' ||
      price.recurring?.interval !== 'month' ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== 'licensed' ||
      price.billing_scheme !== 'per_unit' ||
      price.unit_amount !== PREMIUM_MONTHLY_CENTS
    )
      throw new BillingError(
        503,
        'Le tarif doit être un abonnement mensuel fixe à 10,99 € en euros, actif dans le bon mode Stripe.',
      );
    return {
      ...base,
      unitAmount: price.unit_amount,
      taxBehavior:
        price.tax_behavior === 'inclusive'
          ? 'inclusive'
          : price.tax_behavior === 'exclusive'
            ? 'exclusive'
            : 'unspecified',
    };
  }
  async function sync() {
    const row = account();
    if (!row.customer) return { subscriptions: [] as Stripe.Subscription[], state: localStatus() };
    const list = await requireStripe().subscriptions.list({
      customer: row.customer,
      status: 'all',
      limit: 100,
    });
    if (list.has_more)
      throw new BillingError(503, 'Le compte de facturation doit être vérifié par l’exploitant.');
    const subscriptions = list.data.filter(
      (sub) => !['canceled', 'incomplete_expired'].includes(sub.status),
    );
    const matching = subscriptions.filter(
      (sub) =>
        sub.metadata.preuvix_workspace === row.id &&
        sub.livemode === settings.live &&
        sub.items.data.some((item) => item.price.id === settings.priceId),
    );
    const current =
      matching.find((sub) => ['active', 'trialing'].includes(sub.status)) ??
      matching[0] ??
      subscriptions[0];
    const premium = Boolean(
      current && matching.includes(current) && ['active', 'trialing'].includes(current.status),
    );
    store.db
      .prepare(
        'UPDATE billing_accounts SET status=?, premium=?, cancel_at_end=?, checked_at=? WHERE mode=?',
      )
      .run(
        current?.status ?? 'none',
        Number(premium),
        Number(current?.cancel_at_period_end ?? false),
        Date.now(),
        mode,
      );
    return { subscriptions, state: localStatus() };
  }
  async function checkout(expectedAmount: number) {
    return serial(async () => {
      const api = requireStripe();
      const price = await readPrice();
      if (price.unitAmount !== expectedAmount)
        throw new BillingError(409, 'Le tarif a changé. Actualisez le montant avant de continuer.');
      let row = account();
      if (!row.customer) {
        const customer = await api.customers.create(
          { metadata: { preuvix_workspace: row.id } },
          { idempotencyKey: `preuvix-customer-${mode}-${row.id}` },
        );
        store.db
          .prepare('UPDATE billing_accounts SET customer=? WHERE mode=?')
          .run(customer.id, mode);
        row = account();
      }
      const { subscriptions } = await sync();
      if (subscriptions.length)
        throw new BillingError(
          409,
          'Un abonnement existe déjà. Utilisez « Gérer mon abonnement ».',
        );
      // Recover existing sessions even if a previous request lost its response.
      const sessions = await api.checkout.sessions.list({ customer: row.customer!, limit: 100 });
      if (sessions.has_more)
        throw new BillingError(503, 'Le compte de facturation doit être vérifié par l’exploitant.');
      const open = sessions.data.find(
        (session) => session.status === 'open' && session.metadata?.preuvix_workspace === row.id,
      );
      if (open) {
        if (
          open.metadata?.price !== settings.priceId ||
          open.metadata?.amount !== String(expectedAmount)
        )
          throw new BillingError(
            409,
            'Une session utilise un ancien tarif. Attendez son expiration avant de réessayer.',
          );
        if (!open.url) throw new BillingError(503, 'Session Stripe indisponible.');
        return { url: open.url };
      }
      if (sessions.data.some((session) => session.metadata?.attempt === row.attempt)) {
        store.db
          .prepare('UPDATE billing_accounts SET attempt=? WHERE mode=?')
          .run(randomUUID(), mode);
        row = account();
      }
      const session = await api.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: row.customer!,
          client_reference_id: row.id,
          line_items: [{ price: settings.priceId, quantity: 1 }],
          locale: 'fr',
          payment_method_types: ['card'],
          metadata: {
            preuvix_workspace: row.id,
            price: settings.priceId,
            amount: String(expectedAmount),
            attempt: row.attempt,
          },
          subscription_data: { metadata: { preuvix_workspace: row.id } },
          success_url: `${config.origin}/?billing=success#billing`,
          cancel_url: `${config.origin}/?billing=cancel#billing`,
        },
        { idempotencyKey: `preuvix-checkout-${mode}-${row.attempt}` },
      );
      if (!session.url || session.status !== 'open')
        throw new BillingError(503, 'Session Stripe indisponible. Réessayez après actualisation.');
      return { url: session.url };
    });
  }
  const webhook: RequestHandler = async (req, res) => {
    if (!enabled || !stripe) {
      res.status(503).json({ error: 'Stripe non configuré.' });
      return;
    }
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.get('stripe-signature') || '',
        settings.webhookSecret,
      );
    } catch {
      res.status(400).json({ error: 'Signature Stripe invalide.' });
      return;
    }
    if (event.livemode !== settings.live) {
      res.status(400).json({ error: 'Mode Stripe incorrect.' });
      return;
    }
    const accepted = [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
    ];
    if (!accepted.includes(event.type)) {
      res.json({ received: true });
      return;
    }
    try {
      await serial(async () => {
        if (store.db.prepare('SELECT id FROM billing_events WHERE id=?').get(event.id)) return;
        const object = event.data.object as { customer?: string | { id: string } | null };
        const customer =
          typeof object.customer === 'string' ? object.customer : object.customer?.id;
        if (!customer || customer !== account().customer) return;
        await sync(); // Retrieve current state: delivery order and event snapshots are not trusted.
        store.db
          .prepare('INSERT OR IGNORE INTO billing_events(id,received_at) VALUES (?,?)')
          .run(event.id, Date.now());
        store.db
          .prepare('DELETE FROM billing_events WHERE received_at<?')
          .run(Date.now() - 30 * 24 * 60 * 60_000);
      });
      res.json({ received: true });
    } catch {
      res.status(503).json({ error: 'Synchronisation Stripe indisponible. Réessayez.' });
    }
  };
  function routes(app: express.Express, requireAuth: RequestHandler) {
    const handle =
      (fn: (req: express.Request) => Promise<unknown>): RequestHandler =>
      async (req, res) => {
        try {
          res.json(await fn(req));
        } catch (error) {
          res.status(error instanceof BillingError ? error.status : 503).json({
            error:
              error instanceof BillingError
                ? error.message
                : 'Stripe est momentanément indisponible. Réessayez.',
          });
        }
      };
    app.get(
      '/api/billing/plan',
      handle(() => readPrice()),
    );
    app.get(
      '/api/billing/status',
      requireAuth,
      handle(() => serial(async () => (enabled ? (await sync()).state : localStatus()))),
    );
    app.post(
      '/api/billing/checkout',
      requireAuth,
      handle(async (req) => {
        const parsed = z
          .object({ expectedAmount: z.number().int().positive() })
          .strict()
          .safeParse(req.body);
        if (!parsed.success)
          throw new BillingError(400, 'Montant attendu manquant ou requête invalide.');
        return checkout(parsed.data.expectedAmount);
      }),
    );
    app.post(
      '/api/billing/portal',
      requireAuth,
      handle(async () => {
        const api = requireStripe();
        const row = account();
        if (!row.customer) throw new BillingError(409, 'Aucun compte de facturation associé.');
        const session = await api.billingPortal.sessions.create({
          customer: row.customer,
          return_url: `${config.origin}/?billing=return#billing`,
        });
        return { url: session.url };
      }),
    );
  }
  let lastRefreshAttempt = 0;
  async function refreshStatus(): Promise<BillingStatus> {
    if (!enabled || !account().customer) return localStatus();
    return serial(async () => {
      if (
        account().checked_at > Date.now() - 5 * 60_000 ||
        lastRefreshAttempt > Date.now() - 5 * 60_000
      )
        return localStatus();
      lastRefreshAttempt = Date.now();
      try {
        return (await sync()).state;
      } catch {
        return localStatus();
      } // Preserve only the bounded, previously verified cache.
    });
  }
  return { webhook, routes, localStatus, refreshStatus };
}
