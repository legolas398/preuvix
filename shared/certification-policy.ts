import type { Manifest } from './types';
import { locationDescription } from './capture';

type Check = { id: string; result: 'passed' | 'review' | 'unverified'; detail: string };

export type CertificationAssessment =
  | {
      policy: 'preuvix-media-v1';
      status: 'review_required' | 'capture_documented' | 'integrity_only';
      aiAuthenticity: 'not_established';
      checks: Check[];
    }
  | {
      policy: 'preuvix-media-v2';
      status:
        | 'review_required'
        | 'camera_signed'
        | 'capture_challenged'
        | 'capture_documented'
        | 'integrity_only';
      // Only a trusted hardware signature declaring a digital capture establishes provenance.
      aiAuthenticity: 'not_established' | 'camera_provenance_verified';
      checks: Check[];
    };

export const certificationLabels: Record<CertificationAssessment['status'], string> = {
  review_required: 'Examen requis — indices de génération ou d’altération',
  camera_signed: 'Signature d’appareil vérifiée — capture matérielle authentifiée',
  capture_challenged: 'Capture avec défi en direct — vérification visuelle à faire',
  capture_documented: 'Capture documentée — origine physique non vérifiée',
  integrity_only: 'Intégrité documentée — origine non vérifiée',
};

const CAPTURE_SOURCE = 'digitalCapture';

// Called only after server decoding and hash/capture verification, before signing.
export function assessCertification(manifest: Manifest): CertificationAssessment {
  const { provenance, capture } = manifest;
  const credentials = provenance.contentCredentials;
  const metadataSignals = provenance.signals.length > 0;
  const c2paInvalid = credentials?.state === 'invalid';
  const c2paAi = Boolean(credentials?.aiDeclared);
  // A marker without any verifiable manifest is still worth a look.
  const unverifiedMarker =
    provenance.credentialsDetected && (!credentials || credentials.state === 'absent');
  const cameraSigned =
    credentials?.state === 'trusted' &&
    !c2paAi &&
    credentials.digitalSourceTypes.includes(CAPTURE_SOURCE);
  const challenge = capture?.challenge;
  const challengeFresh =
    Boolean(challenge) &&
    typeof capture?.elapsedSeconds === 'number' &&
    capture.elapsedSeconds <= challenge!.maxSeconds;
  const review = metadataSignals || c2paInvalid || c2paAi || unverifiedMarker;
  const status = review
    ? 'review_required'
    : cameraSigned
      ? 'camera_signed'
      : challengeFresh
        ? 'capture_challenged'
        : capture
          ? 'capture_documented'
          : 'integrity_only';
  const signer = credentials?.signer
    ? [credentials.signer.commonName, credentials.signer.issuer].filter(Boolean).join(' / ')
    : 'signataire inconnu';
  const c2paCheck: Check =
    !credentials || credentials.state === 'absent'
      ? {
          id: 'c2pa',
          result: unverifiedMarker ? 'review' : 'unverified',
          detail: unverifiedMarker
            ? 'Marqueur C2PA présent mais aucun manifeste lisible : à examiner.'
            : 'Aucune signature d’appareil C2PA (Content Credentials) dans le fichier.',
        }
      : credentials.state === 'unsupported'
        ? {
            id: 'c2pa',
            result: 'unverified',
            detail: 'Format non pris en charge par la validation C2PA.',
          }
        : credentials.state === 'invalid'
          ? {
              id: 'c2pa',
              result: 'review',
              detail: `Signature C2PA invalide ou fichier modifié après signature (${credentials.failures.join(', ') || 'lecture impossible'}).`,
            }
          : c2paAi
            ? {
                id: 'c2pa',
                result: 'review',
                detail: `Le manifeste C2PA signé déclare un contenu synthétique ou IA (${credentials.digitalSourceTypes.join(', ')}).`,
              }
            : credentials.state === 'trusted'
              ? {
                  id: 'c2pa',
                  result: cameraSigned ? 'passed' : 'unverified',
                  detail: cameraSigned
                    ? `Signature C2PA valide d’un signataire de confiance (${signer}) déclarant une capture numérique.`
                    : `Signature C2PA valide et de confiance (${signer}), sans déclaration de capture numérique.`,
                }
              : {
                  id: 'c2pa',
                  result: 'unverified',
                  detail: `Signature C2PA intègre, mais signataire hors liste de confiance (${signer}).`,
                };
  return {
    policy: 'preuvix-media-v2',
    status,
    aiAuthenticity:
      cameraSigned && !metadataSignals ? 'camera_provenance_verified' : 'not_established',
    checks: [
      { id: 'decode', result: 'passed', detail: 'Photo ou vidéo décodée par le serveur.' },
      {
        id: 'hash',
        result: 'passed',
        detail: 'Empreinte SHA-256 calculée sur les octets originaux conservés.',
      },
      {
        id: 'capture',
        result: capture ? 'passed' : 'unverified',
        detail: capture
          ? 'Fichier lié à une session et une empreinte engagée auprès du serveur.'
          : 'Import sans session de capture vérifiée.',
      },
      {
        id: 'challenge',
        result: challengeFresh ? 'review' : 'unverified',
        detail: challenge
          ? challengeFresh
            ? `Défi « ${challenge.code} » + « ${challenge.gesture} » émis ${capture!.elapsedSeconds} s avant l’engagement : sa présence dans l’image doit être vérifiée visuellement.`
            : `Défi émis mais engagement trop tardif (${capture!.elapsedSeconds ?? '?'} s > ${challenge.maxSeconds} s).`
          : 'Aucun défi en direct.',
      },
      c2paCheck,
      {
        id: 'location',
        result: capture?.location?.start.status === 'recorded' ? 'review' : 'unverified',
        detail: `Localisation déclarée par le navigateur : ${locationDescription(capture?.location?.start)} Le lieu réel n’est pas authentifié.`,
      },
      {
        id: 'ai_metadata',
        result: metadataSignals ? 'review' : 'unverified',
        detail: metadataSignals
          ? `Indices déclaratifs à examiner : ${provenance.signals.join(', ')}.`
          : 'Aucun indice reconnu dans les métadonnées. Ce résultat ne prouve pas une absence d’IA.',
      },
      {
        id: 'physical_origin',
        result: cameraSigned ? 'passed' : 'unverified',
        detail: cameraSigned
          ? 'Origine matérielle attestée par la signature de l’appareil ; la scène elle-même reste à apprécier.'
          : 'Capteur physique, caméra virtuelle et scène réelle non authentifiés.',
      },
    ],
  };
}
