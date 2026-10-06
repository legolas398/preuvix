import { z } from 'zod';

export const transmissionInput = z
  .object({
    proofIds: z
      .array(z.uuid())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
    recipient: z.string().trim().max(120),
    summary: z.string().trim().max(1500),
    includeOriginals: z.boolean(),
    includeNotes: z.boolean(),
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  })
  .strict();
export type TransmissionInput = z.infer<typeof transmissionInput>;
export type TransmissionState = 'draft' | 'ready' | 'created' | 'expired' | 'revoked';
export const transmissionLabels: Record<TransmissionState, string> = {
  draft: 'Brouillon',
  ready: 'Prêt',
  created: 'Lien créé',
  expired: 'Expiré',
  revoked: 'Révoqué',
};
export type TransmissionPreview = {
  recipient: string;
  summary: string;
  includeOriginals: boolean;
  includeNotes: boolean;
  documents: { id: string; title: string; sha256: string; bytes: number; notes?: string }[];
};
export type Transmission = {
  id: string;
  input: TransmissionInput;
  revision: number;
  state: TransmissionState;
  updatedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  preview: TransmissionPreview;
};
export type TransmissionAccess = { preview: TransmissionPreview; expiresAt: string };
