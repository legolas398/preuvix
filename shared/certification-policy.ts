import type { Manifest } from './types';

export type CertificationAssessment = {
  policy: 'preuvix-media-v1';
  status: 'review_required' | 'capture_documented' | 'integrity_only';
  aiAuthenticity: 'not_established';
  checks: { id: string; result: 'passed' | 'review' | 'unverified'; detail: string }[];
};

export const certificationLabels = {
  review_required: 'Examen requis — indices de provenance',
  capture_documented: 'Capture documentée — origine physique non vérifiée',
  integrity_only: 'Intégrité documentée — origine non vérifiée',
};

// Called only after server decoding and hash/capture verification, before signing.
export function assessCertification(manifest: Manifest): CertificationAssessment {
  const review = manifest.provenance.signals.length > 0 || manifest.provenance.credentialsDetected;
  return {
    policy: 'preuvix-media-v1',
    status: review ? 'review_required' : manifest.capture ? 'capture_documented' : 'integrity_only',
    aiAuthenticity: 'not_established',
    checks: [
      { id: 'decode', result: 'passed', detail: 'Photo ou vidéo décodée par le serveur.' },
      {
        id: 'hash',
        result: 'passed',
        detail: 'Empreinte SHA-256 calculée sur les octets originaux conservés.',
      },
      {
        id: 'capture',
        result: manifest.capture ? 'passed' : 'unverified',
        detail: manifest.capture
          ? 'Fichier lié à une session et une empreinte engagée auprès du serveur.'
          : 'Import sans session de capture vérifiée.',
      },
      {
        id: 'ai_metadata',
        result: review ? 'review' : 'unverified',
        detail: review
          ? 'Indices déclaratifs ou marqueur C2PA à examiner ; aucune signature C2PA validée.'
          : 'Aucun indice reconnu. Ce résultat ne prouve pas une absence d’IA.',
      },
      {
        id: 'physical_origin',
        result: 'unverified',
        detail: 'Capteur physique, caméra virtuelle et scène réelle non authentifiés.',
      },
    ],
  };
}
