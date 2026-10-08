import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { hash } from './integrity';
import type { ServiceKind } from '../shared/cases';

export function evidenceServiceConfig(env: NodeJS.ProcessEnv) {
  function provider(prefix: 'ANCHOR' | 'SIGNATURE') {
    const url = env[`${prefix}_SERVICE_URL`] || '';
    if (url) {
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      )
        throw new Error(
          `${prefix}_SERVICE_URL must be an HTTPS base URL without credentials, query or fragment.`,
        );
    }
    const name = env[`${prefix}_SERVICE_NAME`] || '';
    const token = env[`${prefix}_SERVICE_TOKEN`] || '';
    const webhookSecret = env[`${prefix}_WEBHOOK_SECRET`] || '';
    if (name.length > 120 || /[\r\n]/.test(token) || (webhookSecret && webhookSecret.length < 32))
      throw new Error(`Invalid ${prefix} service configuration.`);
    return {
      url: url.replace(/\/$/, ''),
      name,
      token,
      webhookSecret,
      configured: Boolean(url && name && token && webhookSecret),
      key: hash(`${url.replace(/\/$/, '')}\n${name}`),
    };
  }
  const anchor = {
    ...provider('ANCHOR'),
    network: env.ANCHOR_NETWORK || '',
    minConfirmations: Number(env.ANCHOR_MIN_CONFIRMATIONS || 1),
  };
  if (
    !Number.isSafeInteger(anchor.minConfirmations) ||
    anchor.minConfirmations < 1 ||
    anchor.minConfirmations > 100000 ||
    anchor.network.length > 120
  )
    throw new Error('Invalid anchor confirmation configuration.');
  anchor.configured &&= Boolean(anchor.network);
  return { anchor, signature: provider('SIGNATURE') };
}
export type EvidenceServices = ReturnType<typeof evidenceServiceConfig>;
export type RemoteKind = Exclude<ServiceKind, 'timestamp'>;
const requestId = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
export const providerStatus = z.object({
  requestId,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(['pending', 'confirmed', 'failed']),
  network: z.string().max(120).optional(),
  transactionId: z.string().min(1).max(200).optional(),
  confirmations: z.number().int().nonnegative().optional(),
  sourceDocumentSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  signedDocumentSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  reportedLevel: z.enum(['unspecified', 'simple', 'advanced', 'qualified']).optional(),
  evidenceReference: z.string().min(1).max(500).optional(),
  confirmedAt: z.iso.datetime().optional(),
});
export async function boundedBody(response: Response, max: number) {
  if (!response.body) throw new Error('Empty service response');
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Buffer[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error('Service response too large');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export function evidenceClient(settings: EvidenceServices, transport: typeof fetch) {
  async function call(
    kind: RemoteKind,
    suffix: string,
    options: RequestInit = {},
    document = false,
  ) {
    const provider = settings[kind];
    if (!provider.configured) throw new Error('Service non configuré.');
    const response = await transport(`${provider.url}${suffix}`, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${provider.token}`,
        Accept: document ? 'application/pdf' : 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error('Service externe indisponible.');
    if (
      !response.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith(document ? 'application/pdf' : 'application/json')
    )
      throw new Error('Réponse de prestataire invalide.');
    const bytes = await boundedBody(response, document ? 15 * 1024 * 1024 : 64 * 1024);
    return document ? bytes : providerStatus.parse(JSON.parse(bytes.toString('utf8')));
  }
  return {
    create: (
      kind: RemoteKind,
      id: string,
      digest: string,
      signature?: { pdf: Buffer; email: string },
    ) =>
      call(kind, '/requests', {
        method: 'POST',
        headers: { 'Idempotency-Key': id },
        body: JSON.stringify(
          kind === 'anchor'
            ? { algorithm: 'sha256', digest, network: settings.anchor.network }
            : {
                algorithm: 'sha256',
                digest,
                documentBase64: signature!.pdf.toString('base64'),
                sourceDocumentSha256: hash(signature!.pdf),
                signerEmail: signature!.email,
              },
        ),
      }) as Promise<z.infer<typeof providerStatus>>,
    status: (kind: RemoteKind, id: string) =>
      call(kind, `/requests/${requestId.parse(id)}`) as Promise<z.infer<typeof providerStatus>>,
    document: (id: string) =>
      call('signature', `/requests/${requestId.parse(id)}/document`, {}, true) as Promise<Buffer>,
  };
}
export function validCallback(raw: Buffer, timestamp: string, signature: string, secret: string) {
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature) ||
    !secret
  )
    return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
