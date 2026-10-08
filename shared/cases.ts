import { z } from 'zod';
import type { Attestation, CaptureRecord } from './capture';
import type { Manifest, TimestampReceipt } from './types';

export const caseInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(3000).default(''),
    declaredAddress: z.string().trim().max(300).default(''),
  })
  .strict();
export type CaseInput = z.infer<typeof caseInput>;
export type CaseFile = {
  fileId: string;
  fileVersion: number;
  proofId: string;
  supersedes: string | null;
  title: string;
  description: string;
  receivedAt: string;
  manifestHash: string;
  file: Manifest['file'];
  capture: CaptureRecord | null;
};
export type CaseManifest = CaseInput & {
  schema: 'preuvix-case/1';
  serialization: 'PREUVIX-JSON-v1';
  id: string;
  version: number;
  createdAt: string;
  previousManifestHash: string | null;
  files: CaseFile[];
};
export type ServiceKind = 'timestamp' | 'anchor' | 'signature';
export type ServiceState = 'pending' | 'confirmed' | 'failed';
export type ServiceResult = {
  provider?: string;
  network?: string;
  transactionId?: string;
  confirmations?: number;
  providerRequestId?: string;
  reportedLevel?: 'unspecified' | 'simple' | 'advanced' | 'qualified';
  qualificationVerified?: false;
  evidenceReference?: string;
  signedDocumentSha256?: string;
  sourceDocumentSha256?: string;
  manifestHash?: string;
  confirmedAt?: string;
  timestamp?: TimestampReceipt;
};
export type CaseOperation = {
  id: string;
  kind: ServiceKind;
  state: ServiceState;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  result: ServiceResult | null;
};
export type CaseDetail = {
  manifest: CaseManifest;
  manifestHash: string;
  attestation: Attestation;
  latestVersion: number;
  versions: { version: number; createdAt: string; manifestHash: string }[];
  operations: CaseOperation[];
  events: { at: string; kind: string; version: number }[];
  services: Record<ServiceKind, { configured: boolean; provider: string | null }>;
};
export type CaseSummary = {
  id: string;
  title: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export const serviceLabels: Record<ServiceKind, string> = {
  timestamp: 'Horodatage prestataire',
  anchor: 'Ancrage blockchain',
  signature: 'Signature électronique',
};
export const serviceStateLabel = (kind: ServiceKind, state?: ServiceState, configured = true) =>
  state === 'confirmed'
    ? kind === 'signature'
      ? 'Validée par le prestataire'
      : 'Confirmé'
    : state === 'failed'
      ? 'Échec — nouvelle tentative possible'
      : state === 'pending'
        ? 'En attente'
        : !configured
          ? 'Non configuré'
          : 'Non demandé';
