import { z } from 'zod';
export const captureCommitSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(['photo', 'video']),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endedAt) >= Date.parse(value.startedAt),
    'Dates incohérentes.',
  );
export type CaptureSession = { id: string; nonce: string; issuedAt: string; expiresAt: string };
export type CaptureRecord = CaptureSession &
  z.infer<typeof captureCommitSchema> & {
    committedAt: string;
    assurance: 'browser_declared_server_committed';
  };
export type Attestation = {
  algorithm: 'Ed25519';
  manifestHash: string;
  signature: string;
  publicKey: string;
  keyId: string;
  scope: 'manifest_bytes';
};
