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
