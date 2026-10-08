import { Reader, Context } from '@contentauth/c2pa-node';
import { createRequire } from 'node:module';
import exifr from 'exifr';
import sharp from 'sharp';
import { hash, inspectImage } from './integrity';
import { MAX_PHOTO_BYTES } from '../shared/photo-format';
import { isSyntheticSource } from '../shared/ai-source';

const require = createRequire(import.meta.url);
const versions = {
  '@contentauth/c2pa-node': require('@contentauth/c2pa-node/package.json').version,
  sharp: sharp.versions.sharp,
  exifr: require('exifr/package.json').version,
};
type Check = 'validée' | 'invalide' | 'non vérifiée';

export async function verifyPhoto(bytes: Buffer, reference: string, anchors: string) {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES)
    throw new Error('Fichier vide ou supérieur à 10 Mio.');
  if (reference && !/^[a-f0-9]{64}$/.test(reference))
    throw new Error('Référence SHA-256 invalide.');
  const image = await inspectImage(bytes);
  const provenance = {
    presence: 'non vérifiée',
    binding: 'non vérifiée' as Check,
    signature: 'non vérifiée' as Check,
    trust: 'non vérifiée',
    trustSource: anchors ? 'Bundle PEM local configuré par l’opérateur' : 'Aucune ancre configurée',
    trustVersion: anchors ? hash(anchors) : null,
    codes: [] as string[],
    error: null as string | null,
  };
  const declarations: {
    source: string;
    action: string;
    digitalSourceType: string;
    validation: string;
  }[] = [];
  try {
    const reader = await Reader.fromAsset(
      { buffer: bytes, mimeType: image.mime },
      new Context({
        verify: {
          verifyAfterReading: true,
          verifyTrust: Boolean(anchors),
          remoteManifestFetch: false,
          ocspFetch: false,
        },
        ...(anchors ? { trust: { trustAnchors: anchors } } : {}),
      }),
    );
    if (!reader) provenance.presence = 'absent';
    else {
      const store = reader.json();
      const active = reader.getActive();
      provenance.presence = active ? 'présent' : 'non vérifiée';
      const results = store.validation_results?.activeManifest;
      const successes = (results?.success ?? []).map((s) => s.code);
      const failures = [...(results?.failure ?? []), ...(store.validation_status ?? [])].map(
        (s) => s.code,
      );
      provenance.codes = [...new Set([...successes, ...failures].filter((c): c is string => !!c))];
      provenance.binding = failures.some((c) =>
        /^(assertion\.(dataHash|bmffHash|boxesHash)|claim\.hardBindings)/.test(c || ''),
      )
        ? 'invalide'
        : successes.some((c) => /^assertion\.(dataHash|bmffHash|boxesHash)\.match$/.test(c || ''))
          ? 'validée'
          : 'non vérifiée';
      provenance.signature = failures.includes('claimSignature.mismatch')
        ? 'invalide'
        : successes.includes('claimSignature.validated')
          ? 'validée'
          : 'non vérifiée';
      provenance.trust =
        anchors && successes.includes('signingCredential.trusted')
          ? 'reconnu par le bundle local'
          : 'signataire non reconnu';
      for (const assertion of active?.assertions ?? []) {
        if (!/^c2pa\.actions(?:\.v\d+)?$/.test(assertion.label)) continue;
        const actions = (assertion.data as { actions?: unknown })?.actions;
        if (!Array.isArray(actions)) continue;
        for (const raw of actions) {
          if (!raw || typeof raw !== 'object') continue;
          const action = raw as { action?: string; digitalSourceType?: string };
          if (typeof action.digitalSourceType !== 'string') continue;
          declarations.push({
            source: assertion.label,
            action: String(action.action ?? ''),
            digitalSourceType: action.digitalSourceType,
            validation:
              store.validation_state !== 'Invalid' &&
              provenance.binding === 'validée' &&
              provenance.signature === 'validée'
                ? 'signature et liaison validées'
                : 'non vérifiée',
          });
        }
      }
    }
  } catch {
    provenance.binding = 'non vérifiée';
    provenance.signature = 'non vérifiée';
    provenance.trust = 'non vérifiée';
    declarations.length = 0;
    provenance.error = 'Lecture ou validation C2PA indisponible ; aucune conclusion favorable.';
  }
  let metadata: Record<string, unknown> = {};
  let metadataState = 'informations non authentifiées';
  try {
    metadata =
      (await exifr.parse(bytes, {
        pick: [
          'Make',
          'Model',
          'Software',
          'CreatorTool',
          'DateTimeOriginal',
          'CreateDate',
          'ModifyDate',
        ],
        gps: false,
      })) || {};
  } catch {
    metadataState = 'lecture impossible — non vérifiées';
  }
  const sha256 = hash(bytes);
  const synthetic = declarations.filter((d) => isSyntheticSource(d.digitalSourceType));
  const signedSynthetic = synthetic.some((d) => d.validation === 'signature et liaison validées');
  const aiStatus = signedSynthetic
    ? 'declared_synthetic'
    : synthetic.length || image.provenance.signals.length
      ? 'signals_found'
      : 'inconclusive';
  const conclusion = signedSynthetic
    ? 'Une déclaration C2PA liée à ce fichier indique une génération ou une retouche par IA, ou une synthèse numérique. Sa signature et sa liaison sont validées ; la confiance dans le signataire est indiquée séparément.'
    : aiStatus === 'signals_found'
      ? 'Des indices de génération ou de retouche IA sont présents dans les métadonnées. Ces déclarations non authentifiées peuvent être modifiées ; elles nécessitent un examen de l’original et de son contexte.'
      : 'Aucun indice IA reconnu dans les métadonnées analysées. Résultat indéterminé : les métadonnées peuvent être absentes ou supprimées.';
  return {
    schema: 'preuvix-photo-verification/1',
    title: 'Rapport de vérification d’intégrité et de provenance',
    file: {
      sha256,
      bytes: bytes.length,
      mime: image.mime,
      width: image.width,
      height: image.height,
    },
    tools: { node: process.version, ...versions },
    integrity: {
      algorithm: 'SHA-256',
      reference: reference || null,
      referenceSource: reference
        ? 'empreinte fournie par l’utilisateur, confiance non établie'
        : null,
      result: reference
        ? sha256 === reference
          ? 'correspondance exacte'
          : 'contenu différent'
        : 'création d’une référence — aucune comparaison',
    },
    provenance,
    ai: {
      status: aiStatus,
      signals: image.provenance.signals,
      declarations,
      conclusion,
      limitation:
        'Cette analyse porte sur les métadonnées et les déclarations C2PA. Aucun détecteur visuel IA exécuté ; aucun résultat ne certifie « sans IA ».',
    },
    context: {
      checkedAt: new Date().toISOString(),
      clock: 'horloge du serveur local, aucun horodatage indépendant',
      metadataState,
      exif: { Make: metadata.Make ?? null, Model: metadata.Model ?? null },
      software: metadata.Software ?? metadata.CreatorTool ?? null,
      dates: {
        DateTimeOriginal: metadata.DateTimeOriginal ?? null,
        CreateDate: metadata.CreateDate ?? null,
        ModifyDate: metadata.ModifyDate ?? null,
      },
    },
    privacy:
      'Traitement en mémoire sur le backend local. Aucun original stocké ou exporté. Aucun appel tiers. GPS, identité, commentaires et métadonnées libres exclus de l’export.',
    limits: [
      'Ne prouve ni la réalité de la scène, ni l’identité de l’auteur, ni la recevabilité.',
      'Révocation en ligne et manifestes distants non consultés.',
      'La clé publique jointe ne prouve pas une appartenance à PREUVIX.',
    ],
  };
}
