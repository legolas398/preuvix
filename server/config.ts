import { readFileSync } from 'node:fs';
import path from 'node:path';

export type Config = ReturnType<typeof readConfig>;

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const origin = env.APP_ORIGIN || 'http://localhost:3000';
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
    throw new Error('APP_ORIGIN must be an origin without a trailing slash.');
  const password = env.OWNER_PASSWORD || '';
  if (password.length < 16 || password.length > 256 || password.startsWith('replace-with-'))
    throw new Error('Set OWNER_PASSWORD in .env to 16–256 random characters.');
  const production = process.argv.includes('--production') || env.NODE_ENV === 'production';
  const secureCookies = env.COOKIE_SECURE === 'true';
  if (production && (url.protocol !== 'https:' || !secureCookies))
    throw new Error('Production requires HTTPS APP_ORIGIN and COOKIE_SECURE=true.');
  const maxStorageMb = Number(env.MAX_STORAGE_MB || 500);
  if (!Number.isFinite(maxStorageMb) || maxStorageMb < 10 || maxStorageMb > 100000)
    throw new Error('Invalid MAX_STORAGE_MB.');
  const stripe = {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    priceId: env.STRIPE_PRICE_ID || '',
    live: (env.STRIPE_SECRET_KEY || '').startsWith('sk_live_'),
    premiumStorageMb: Number(env.PREMIUM_STORAGE_MB || Math.max(maxStorageMb, 5000)),
  };
  if (stripe.secretKey && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(stripe.secretKey))
    throw new Error('Invalid STRIPE_SECRET_KEY.');
  if (stripe.priceId && !/^price_[A-Za-z0-9]+$/.test(stripe.priceId))
    throw new Error('Invalid STRIPE_PRICE_ID.');
  if (stripe.webhookSecret && !/^whsec_[A-Za-z0-9]+$/.test(stripe.webhookSecret))
    throw new Error('Invalid STRIPE_WEBHOOK_SECRET.');
  if (
    stripe.live &&
    (env.STRIPE_ALLOW_LIVE !== 'true' || url.protocol !== 'https:' || !secureCookies)
  )
    throw new Error('Live billing requires STRIPE_ALLOW_LIVE=true, HTTPS and secure cookies.');
  if (
    !Number.isInteger(stripe.premiumStorageMb) ||
    stripe.premiumStorageMb < maxStorageMb ||
    stripe.premiumStorageMb > 100000
  )
    throw new Error('Invalid PREMIUM_STORAGE_MB.');
  const timestamp = {
    url: env.TSA_URL || '',
    authorization: env.TSA_AUTHORIZATION || '',
    name: env.TSA_NAME || '',
    caFile: env.TSA_CA_FILE ? path.resolve(env.TSA_CA_FILE) : '',
    policyOid: env.TSA_POLICY_OID || '',
    signerSha256: (env.TSA_SIGNER_SHA256 || '').replace(/:/g, '').toLowerCase(),
    openssl: env.OPENSSL_BIN || 'openssl',
    trustListUrl: env.TSA_TRUST_LIST_URL || '',
    reviewValidUntil: env.TSA_REVIEW_VALID_UNTIL || '',
  };
  if (timestamp.url && new URL(timestamp.url).protocol !== 'https:')
    throw new Error('TSA_URL requires HTTPS.');
  if (timestamp.trustListUrl && new URL(timestamp.trustListUrl).protocol !== 'https:')
    throw new Error('TSA_TRUST_LIST_URL requires HTTPS.');
  const timestampConfigured = Boolean(
    timestamp.url &&
    timestamp.name &&
    timestamp.caFile &&
    /^\d+(\.\d+)+$/.test(timestamp.policyOid) &&
    /^[a-f0-9]{64}$/.test(timestamp.signerSha256),
  );
  const qualifiedServiceReviewed =
    timestampConfigured &&
    Boolean(timestamp.trustListUrl) &&
    Date.parse(timestamp.reviewValidUntil) > Date.now();
  if (production && env.REQUIRE_TIMESTAMP !== 'false' && !qualifiedServiceReviewed)
    throw new Error(
      'Qualified launch gate: configure the RFC 3161 service, pinned signer, policy, CA and a current trusted-list review.',
    );
  // PEM bundle of C2PA trust anchors (e.g. the official C2PA trust list). Without it,
  // camera signatures are checked for integrity but signers are never reported as trusted.
  const c2paTrustAnchors = env.C2PA_TRUST_ANCHORS
    ? readFileSync(path.resolve(env.C2PA_TRUST_ANCHORS), 'utf8')
    : '';
  if (c2paTrustAnchors && !c2paTrustAnchors.includes('-----BEGIN CERTIFICATE-----'))
    throw new Error('C2PA_TRUST_ANCHORS must point to a PEM certificate bundle.');
  // Address shown on the public "Devenir partenaire" link. Optional.
  const communityContact = env.COMMUNITY_CONTACT_EMAIL || '';
  if (communityContact && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(communityContact))
    throw new Error('Invalid COMMUNITY_CONTACT_EMAIL.');
  return {
    origin,
    c2paTrustAnchors,
    communityContact,
    // TrustMark models (~65 MB), downloaded on first use if absent.
    trustmarkModelDir: path.resolve(
      env.TRUSTMARK_MODEL_DIR || path.join(env.DATA_DIR || './data', 'models', 'trustmark'),
    ),
    password,
    production,
    secureCookies,
    maxStorageMb,
    stripe,
    timestamp,
    timestampConfigured,
    qualifiedServiceReviewed,
    dataDir: path.resolve(env.DATA_DIR || './data'),
    port: Number(env.PORT || 3000),
    host: env.HOST || '127.0.0.1',
  };
}
