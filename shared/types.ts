import type { CaptureRecord, Attestation } from './capture';
export type Provenance = {
  result: 'signals_found' | 'inconclusive';
  signals: string[];
  credentialsDetected: boolean;
  explanation: string;
};

export type Manifest = {
  certification?: import('./certification-policy').CertificationAssessment;
  version: 1;
  id: string;
  receivedAt: string;
  title: string;
  description: string;
  source: 'upload' | 'camera';
  sourceAssurance: 'client_declared';
  capture?: CaptureRecord;
  declaration?: { author: string; context: string; statement: string };
  file: {
    name: string;
    mime: string;
    size: number;
    sha256: string;
    width: number;
    height: number;
    durationSeconds?: number;
  };
  provenance: Provenance;
};

export type TimestampReceipt = {
  provider: string;
  time: string;
  verifiedAt: string;
  policyOid: string;
  signerSha256: string;
  responseSha256: string;
  qualification: 'operator_reviewed' | 'not_assessed';
  trustListUrl: string | null;
  reviewValidUntil: string | null;
};

export type Proof = {
  id: string;
  manifest: Manifest;
  manifestHash: string;
  status: 'pending' | 'timestamped';
  receipt: TimestampReceipt | null;
  events: { at: string; kind: string }[];
  shareToken: string | null;
  attestation?: Attestation;
};

export type PublicProof = {
  id: string;
  fileHash: string;
  manifestHash: string;
  status: Proof['status'];
  receipt: TimestampReceipt | null;
  storedFileMatches: boolean;
  manifestMatches: boolean;
};

export type AppConfig = {
  authenticated: boolean;
  timestampConfigured: boolean;
  providerName: string | null;
  qualifiedServiceReviewed: boolean;
  maxFileMb: number;
  maxStorageMb: number;
  maxVideoMb?: number;
};
