import type { AnnexStatement, CustodyEntry, DocumentStatement } from './capture';

// One link of the chain from capture to issued documents, verified by the server on each read.
export type ChainLink = {
  id:
    | 'capture'
    | 'challenge'
    | 'progressive'
    | 'media'
    | 'signature'
    | 'analysis'
    | 'timestamp'
    | 'annexes'
    | 'custody'
    | 'documents';
  label: string;
  state: 'verified' | 'pending' | 'warning' | 'failed' | 'absent';
  detail: string;
  at?: string;
};

export type AnnexSummary = AnnexStatement & { signatureValid: boolean; contentMatches: boolean };
export type DocumentSummary = DocumentStatement & { signatureValid: boolean };
export type CustodySummary = {
  length: number;
  head: string;
  intact: boolean;
  problem: string | null;
  entries: CustodyEntry[];
};

export const custodyLabels: Record<string, string> = {
  custody_opened: 'Ouverture du journal signé',
  capture_session_issued: 'Session de capture et défi émis',
  capture_committed: 'Empreinte du média engagée',
  original_received: 'Original reçu et recalculé',
  manifest_signed: 'Manifeste figé et signé',
  timestamp_verified: 'Horodatage RFC 3161 vérifié',
  challenge_reviewed: 'Défi vérifié visuellement',
  annex_added: 'Pièce annexe scellée',
  document_issued: 'Document émis et signé',
  protected_copy_issued: 'Copie protégée émise',
  share_enabled: 'Lien de vérification activé',
  share_disabled: 'Lien de vérification désactivé',
  recipient_link_created: 'Lien destinataire créé',
  recipient_link_revoked: 'Lien destinataire révoqué',
  recipient_viewed: 'Consultation par un destinataire',
};
