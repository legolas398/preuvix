import { z } from 'zod';
export const locationSampleSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('recorded'),
      source: z.literal('browser_geolocation').optional(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().nonnegative().max(1000000),
      measuredAt: z.iso.datetime(),
    })
    .strict(),
  z.object({ status: z.enum(['not_requested', 'denied', 'unavailable']) }).strict(),
]);
export type LocationSample = z.infer<typeof locationSampleSchema>;
export function locationDescription(sample?: LocationSample): string {
  if (!sample) return 'Non relevée (dossier antérieur ou fichier importé).';
  if (sample.status === 'recorded')
    return `${sample.latitude.toFixed(6)}, ${sample.longitude.toFixed(6)} · précision annoncée ± ${Math.round(sample.accuracy)} m · mesure ${sample.measuredAt}`;
  return {
    not_requested: 'Non demandée : localisation non activée.',
    denied: 'Permission de localisation refusée.',
    unavailable: 'Position indisponible ou délai dépassé.',
  }[sample.status];
}
export const captureCommitSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(['photo', 'video']),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    nonce: z.string().regex(/^[a-f0-9]{32}$/),
    location: z
      .object({ start: locationSampleSchema, end: locationSampleSchema.optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endedAt) >= Date.parse(value.startedAt),
    'Dates incohérentes.',
  );
// Shown to the person filming; must appear in the frame. Verified visually after deposit.
export type LivenessChallenge = { code: string; gesture: string; maxSeconds: number };
export type CaptureSession = {
  id: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  challenge?: LivenessChallenge;
};
export type CaptureRecord = CaptureSession &
  z.infer<typeof captureCommitSchema> & {
    committedAt: string;
    assurance: 'browser_declared_server_committed';
    // Seconds between challenge issuance and server commitment of the fingerprint.
    elapsedSeconds?: number;
  };
export type Attestation = {
  algorithm: 'Ed25519';
  manifestHash: string;
  signature: string;
  publicKey: string;
  keyId: string;
  scope: 'manifest_bytes';
};
export const reviewOutcomes = ['confirmed', 'absent', 'unclear'] as const;
export type ChallengeReview = {
  type: 'preuvix-challenge-review-v1';
  proofId: string;
  manifestHash: string;
  outcome: (typeof reviewOutcomes)[number];
  reviewer: string;
  note: string;
  reviewedAt: string;
};
export type SignedReview = {
  payload: string;
  review: ChallengeReview;
  signature: string;
  keyId: string;
  publicKey: string;
};
