import { z } from 'zod';
export const captureCommitSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(['photo', 'video']),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    // Browser-reported camera track; a virtual camera label triggers a review.
    device: z
      .object({
        label: z.string().max(200),
        width: z.number().int().min(0).max(20000).optional(),
        height: z.number().int().min(0).max(20000).optional(),
        frameRate: z.number().min(0).max(1000).optional(),
      })
      .strict()
      .optional(),
    // Video only: sizes of the MediaRecorder chunks, whose concatenation is the file.
    segments: z.array(z.number().int().positive()).max(20000).optional(),
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
// Progressive commitment sent while a video records: chain over the chunks received so far.
export const checkpointSchema = z
  .object({
    offset: z.number().int().positive(),
    chunks: z.number().int().positive().max(20000),
    chain: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type Checkpoint = z.infer<typeof checkpointSchema> & { at: string };
// Verdict on the checkpoints, computed by the server from the deposited bytes.
export type ProgressiveCommitment = {
  checkpoints: number;
  verified: boolean;
  spanSeconds: number;
  detail: string;
};
export type CaptureRecord = CaptureSession &
  z.infer<typeof captureCommitSchema> & {
    committedAt: string;
    assurance: 'browser_declared_server_committed';
    // Seconds between challenge issuance and server commitment of the fingerprint.
    elapsedSeconds?: number;
    checkpoints?: Checkpoint[];
    progressive?: ProgressiveCommitment;
  };
/** h_i = sha256(h_{i-1} || sha256(chunk_i)), starting from the session nonce. */
export const CHAIN_LABEL = 'preuvix-progressive-v1';
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

// Every signed statement below embeds its exact JSON payload and the installation key.
export type Signed<T> = {
  payload: string;
  content: T;
  signature: string;
  keyId: string;
  publicKey: string;
};
export type CustodyEntry = {
  type: 'preuvix-custody-v1';
  proofId: string;
  seq: number;
  at: string;
  kind: string;
  detail: Record<string, string | number | boolean>;
  // SHA-256 of the previous entry's payload; 64 zeros for the first one.
  prev: string;
};
export type AnnexStatement = {
  type: 'preuvix-annex-v1';
  annexId: string;
  proofId: string;
  manifestHash: string;
  seq: number;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  note: string;
  addedAt: string;
};
export type DocumentStatement = {
  type: 'preuvix-document-v1';
  documentId: string;
  proofId: string;
  manifestHash: string;
  kind: 'report' | 'export';
  sha256: string;
  size: number;
  issuedAt: string;
  // Custody chain head at issuance: the document reflects the dossier at this point.
  custodyHead: string;
  custodyLength: number;
};
