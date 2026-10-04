import type { Proof } from '../shared/types';
import type { ChainLink } from '../shared/chain';
import { VIRTUAL_CAMERA } from '../shared/certification-policy';
import type { Row, Store } from './store';
import { hash } from './integrity';

/**
 * Re-verifies every link from the capture to the issued documents. Nothing is cached:
 * a link is "verified" only if its bytes and signatures check out now.
 */
export function buildChain(store: Store, row: Row, proof: Proof): ChainLink[] {
  const { manifest } = proof;
  const capture = manifest.capture;
  const certification = manifest.certification;
  const links: ChainLink[] = [];

  const device = capture?.device?.label?.trim();
  links.push(
    !capture
      ? {
          id: 'capture',
          label: 'Prise de vue',
          state: 'absent',
          detail:
            'Fichier importé : aucune session de capture. L’origine et la date de prise de vue ne sont pas documentées.',
        }
      : {
          id: 'capture',
          label: 'Prise de vue',
          state: device && VIRTUAL_CAMERA.test(device) ? 'warning' : 'verified',
          at: capture.issuedAt,
          detail: `Session serveur ouverte puis empreinte engagée ${capture.elapsedSeconds ?? '?'} s plus tard${
            device ? ` · caméra déclarée « ${device} »` : ''
          }.`,
        },
  );

  if (capture?.challenge) {
    const latest = proof.reviews?.at(-1)?.review;
    const fresh = (capture.elapsedSeconds ?? Infinity) <= capture.challenge.maxSeconds;
    links.push({
      id: 'challenge',
      label: `Défi en direct « ${capture.challenge.code} »`,
      state: !fresh
        ? 'warning'
        : latest?.outcome === 'confirmed'
          ? 'verified'
          : latest?.outcome === 'absent'
            ? 'failed'
            : latest
              ? 'warning'
              : 'pending',
      at: latest?.reviewedAt,
      detail: !fresh
        ? 'Engagement hors délai : le défi ne démontre pas la fraîcheur de la capture.'
        : latest
          ? `Vérification visuelle signée : ${
              {
                confirmed: 'visible et conforme',
                absent: 'absent ou non conforme',
                unclear: 'illisible',
              }[latest.outcome]
            } (${latest.reviewer}, nom déclaré).`
          : 'Défi émis dans le délai. Sa présence dans l’image doit encore être vérifiée visuellement.',
    });
  }

  if (capture?.kind === 'video') {
    const progressive = capture.progressive;
    links.push({
      id: 'progressive',
      label: 'Enregistrement progressif',
      state: progressive?.verified ? 'verified' : progressive?.checkpoints ? 'failed' : 'absent',
      detail: progressive?.detail ?? 'Aucun engagement progressif pendant l’enregistrement.',
    });
  }

  const originalOk = hash(row.original) === manifest.file.sha256;
  links.push({
    id: 'media',
    label: 'Original conservé',
    state: originalOk ? 'verified' : 'failed',
    at: manifest.receivedAt,
    detail: originalOk
      ? `SHA-256 recalculé à l’instant, identique à l’empreinte ${capture ? 'engagée et ' : ''}figée au dépôt.`
      : 'Les octets conservés ne correspondent plus à l’empreinte du manifeste.',
  });

  const attestation = proof.attestation;
  const manifestOk = hash(row.manifest) === row.manifest_hash;
  links.push({
    id: 'signature',
    label: 'Manifeste signé',
    state: !manifestOk
      ? 'failed'
      : !attestation
        ? 'warning'
        : store.trustedKeys.has(attestation.keyId)
          ? 'verified'
          : 'failed',
    detail: !manifestOk
      ? 'Le manifeste ne correspond plus à son empreinte.'
      : !attestation
        ? 'Dossier antérieur aux signatures : manifeste non signé.'
        : store.trustedKeys.has(attestation.keyId)
          ? `Signature Ed25519 valide, clé de cette installation (${attestation.keyId.slice(0, 16)}…).`
          : 'Signature produite par une clé inconnue de cette installation.',
  });

  if (certification)
    links.push({
      id: 'analysis',
      label: 'Analyse de provenance',
      state:
        certification.status === 'review_required'
          ? 'warning'
          : certification.status === 'camera_signed'
            ? 'verified'
            : 'absent',
      detail:
        certification.status === 'review_required'
          ? `Examen requis : ${certification.checks
              .filter((check) => check.result === 'review' && check.id !== 'challenge')
              .map((check) => check.detail)
              .join(' ')}`
          : certification.status === 'camera_signed'
            ? 'Signature d’appareil C2PA de confiance : origine matérielle attestée.'
            : 'Aucun indice d’IA ou d’altération reconnu. Cela ne prouve pas l’absence d’IA.',
    });

  links.push(
    proof.receipt
      ? {
          id: 'timestamp',
          label: 'Horodatage indépendant',
          state: 'verified',
          at: proof.receipt.time,
          detail: `Jeton RFC 3161 de ${proof.receipt.provider}, vérifié à la réception.`,
        }
      : {
          id: 'timestamp',
          label: 'Horodatage indépendant',
          state: 'pending',
          detail: 'Aucun jeton RFC 3161 : la date repose sur l’horloge de cette installation.',
        },
  );

  const annexes = proof.annexes ?? [];
  const brokenAnnex = annexes.find((annex) => !annex.signatureValid || !annex.contentMatches);
  links.push({
    id: 'annexes',
    label: 'Pièces annexes',
    state: !annexes.length ? 'absent' : brokenAnnex ? 'failed' : 'verified',
    detail: !annexes.length
      ? 'Aucune pièce annexe scellée.'
      : brokenAnnex
        ? `« ${brokenAnnex.name} » ne correspond plus à sa déclaration signée.`
        : `${annexes.length} pièce${annexes.length > 1 ? 's' : ''} scellée${
            annexes.length > 1 ? 's' : ''
          } : contenu recalculé et déclaration signée, liée au manifeste.`,
  });

  const custody = proof.custody;
  links.push({
    id: 'custody',
    label: 'Journal de conservation',
    state: !custody?.length
      ? 'warning'
      : !custody.intact
        ? 'failed'
        : custody.entries[0]?.kind === 'custody_opened'
          ? 'warning'
          : 'verified',
    detail: !custody?.length
      ? 'Aucun journal signé pour ce dossier.'
      : !custody.intact
        ? `Journal altéré : ${custody.problem}`
        : `${custody.length} événements chaînés et signés, sans rupture${
            custody.entries[0]?.kind === 'custody_opened'
              ? ' depuis l’ouverture du journal (dossier antérieur : événements précédents non chaînés)'
              : capture
                ? ' depuis la prise de vue'
                : ' depuis la réception du fichier'
          }.`,
  });

  const documents = proof.documents ?? [];
  const brokenDocument = documents.find((document) => !document.signatureValid);
  links.push({
    id: 'documents',
    label: 'Documents émis',
    state: !documents.length ? 'pending' : brokenDocument ? 'failed' : 'verified',
    at: documents[0]?.issuedAt,
    detail: !documents.length
      ? 'Aucun rapport ni export émis pour l’instant.'
      : brokenDocument
        ? `Le document ${brokenDocument.documentId} porte une signature invalide.`
        : `${documents.length} document${documents.length > 1 ? 's' : ''} émis (${[
            ...new Set(documents.map((d) => (d.kind === 'report' ? 'rapport PDF' : 'export ZIP'))),
          ].join(', ')}), chacun enregistré et signé : une copie modifiée ne sera pas reconnue.`,
  });
  return links;
}
