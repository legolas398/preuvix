import type { CaptureRecord, Attestation } from './capture';
export type Provenance = {
  result: 'signals_found' | 'inconclusive';
  signals: string[];
  credentialsDetected: boolean;
  explanation: string;
  contentCredentials?: ContentCredentials;
};

// Result of a real C2PA signature validation (not a marker search).
export type ContentCredentials = {
  state: 'absent' | 'invalid' | 'valid_untrusted' | 'trusted' | 'unsupported';
  signer: { issuer: string | null; commonName: string | null; time: string | null } | null;
  claimGenerator: string | null;
  digitalSourceTypes: string[];
  aiDeclared: boolean;
  failures: string[];
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
  reviews?: import('./capture').SignedReview[];
  watermarked?: boolean;
  recipientLinks?: RecipientLink[];
};

// Private, revocable link giving a recipient (e.g. a commissaire de justice) read access.
export type RecipientLink = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  views: number;
  lastViewAt: string | null;
};

// What the recipient page receives: no owner-only controls, no tokens.
export type RecipientDossier = {
  proof: Omit<Proof, 'shareToken' | 'recipientLinks' | 'events'>;
  label: string;
  expiresAt: string;
  integrity: { originalMatches: boolean; manifestMatches: boolean };
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
