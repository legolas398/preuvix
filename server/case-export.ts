import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';
import { hash } from './integrity';
import { canonicalJson } from '../shared/canonical';
import { locationDescription, type Attestation } from '../shared/capture';
import { serviceLabels, serviceStateLabel, type CaseDetail } from '../shared/cases';
import type { Store } from './store';
import { CaseError } from './case-store';

const fontBytes = readFileSync(
  path.resolve('node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff'),
);
export async function caseReport(detail: CaseDetail) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes);
  let page = doc.addPage([595, 842]),
    y = 790;
  const supported = new Set(font.getCharacterSet());
  function heading(text: string, size = 15) {
    if (y < 125) {
      page = doc.addPage([595, 842]);
      y = 790;
    }
    y -= 10;
    line(text, size);
    page.drawLine({
      start: { x: 45, y: y + 3 },
      end: { x: 550, y: y + 3 },
      thickness: 0.5,
      color: rgb(0.8, 0.75, 0.7),
    });
    y -= 7;
  }
  function line(text: string, size = 10) {
    // Every Unicode character is rendered by the embedded font, never interpolated as PDF code.
    let current = '';
    const flush = () => {
      if (y < 55) {
        page = doc.addPage([595, 842]);
        y = 790;
      }
      page.drawText(current, { x: 45, y, size, font, color: rgb(0.16, 0.12, 0.1) });
      y -= size + 7;
      current = '';
    };
    for (const raw of text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')) {
      const character = raw === '\n' || supported.has(raw.codePointAt(0)!) ? raw : '?';
      if (character === '\n') {
        flush();
        continue;
      }
      if (font.widthOfTextAtSize(current + character, size) > 505) flush();
      current += character;
    }
    flush();
  }
  const m = detail.manifest;
  heading('PREUVIX · Dossier récapitulatif', 20);
  line(`${m.title} · version ${m.version}`, 15);
  line(`Référence : ${m.id}`);
  line(`Version enregistrée par le serveur (UTC) : ${m.createdAt}`);
  line(`SHA-256 du manifeste de cette version : ${detail.manifestHash}`);
  line(
    'La réception serveur n’est pas un horodatage certifié. La signature technique PREUVIX n’est pas la signature électronique d’une personne.',
  );
  line(m.description || 'Aucune description.');
  line(`Adresse saisie (déclarative, sans capture GPS) : ${m.declaredAddress || 'Non renseignée'}`);
  for (const file of m.files) {
    heading(`${file.title} · fichier v${file.fileVersion}`, 13);
    line(`${file.file.name} · ${file.file.mime} · ${file.file.size} octets`);
    line(`Réception serveur UTC : ${file.receivedAt}`);
    line(`Fichier enregistré · empreinte SHA-256 calculée : ${file.file.sha256}`);
    line(`Manifeste du fichier : ${file.manifestHash}`);
    if (file.mobileEvidence) {
      const mobile = file.mobileEvidence;
      line(
        `Origine déclarée : ${mobile.origin !== 'system_file_picker' ? 'caméra Android' : 'sélecteur de fichiers Android'}.`,
      );
      line(`Heure du téléphone (non qualifiée) : ${mobile.selectedAt}`);
      line(
        `Transformation : ${mobile.transformation === 'none_by_preuvix' ? 'aucune par Preuvix' : mobile.transformation === 'camera_video_encoding' ? 'vidéo encodée en direct par la caméra intégrée' : 'JPEG produit par la caméra / le plugin, traitement possible'}.`,
      );
      line(
        `Localisation déclarative (${mobile.location.status === 'recorded' ? mobile.location.source : 'sans position'}) : ${locationDescription(mobile.location)}`,
      );
    }
    if (!file.mobileEvidence)
      line(
        `Position capturée (source : navigateur) : ${locationDescription(file.capture?.location?.start)}`,
      );
    if (file.capture?.kind === 'video')
      line(`Fin de vidéo : ${locationDescription(file.capture.location?.end)}`);
    if (file.supersedes) line(`Version précédente conservée : ${file.supersedes}`);
  }
  heading('Justificatifs de cette version');
  for (const kind of ['timestamp', 'anchor', 'signature'] as const) {
    const operation = detail.operations.find((item) => item.kind === kind);
    line(
      `${serviceLabels[kind]} : ${serviceStateLabel(kind, operation?.state, detail.services[kind].configured)}`,
    );
    if (operation?.result) {
      const result = operation.result;
      if (result.provider) line(`Prestataire : ${result.provider}`);
      if (result.otsProofBase64) {
        line(
          `Preuve OpenTimestamps Bitcoin : ${result.blockHeight ? `bloc ${result.blockHeight}, ${result.confirmations} confirmations` : 'en attente de confirmation'}`,
        );
        line(
          'Contrôle de la racine de Merkle avec deux explorateurs publics ; seuil de 6 confirmations.',
        );
      }
      if (result.network)
        line(
          `Réseau : ${result.network} · transaction : ${result.transactionId ?? 'En attente'} · confirmations annoncées : ${result.confirmations ?? 0}`,
        );
      if (result.timestamp)
        line(
          `Jeton RFC 3161 vérifié : ${result.timestamp.time} · politique ${result.timestamp.policyOid} · qualification ${result.timestamp.qualification === 'operator_reviewed' ? 'examinée par l’exploitant, non validée automatiquement' : 'non évaluée'}`,
        );
      if (kind === 'signature') {
        line(
          `Niveau déclaré par le prestataire : ${result.reportedLevel ?? 'non renseigné'} ; qualification eIDAS non vérifiée par PREUVIX.`,
        );
        if (result.evidenceReference)
          line(`Référence du justificatif prestataire : ${result.evidenceReference}`);
        if (result.signedDocumentSha256)
          line(`Document retourné : SHA-256 ${result.signedDocumentSha256}`);
      }
    }
    if (operation?.error) line(operation.error);
  }
  line(
    'L’ancrage porte sur le manifeste de version, pas sur le rapport généré ensuite. Les justificatifs sont joints au ZIP. OpenTimestamps est contrôlé avec les explorateurs Bitcoin ; un prestataire personnalisé fournit sa propre confirmation. Aucun ancrage n’établit la réalité des faits.',
  );
  line(
    'Les coordonnées peuvent être simulées. Aucune preuve incontestable ni recevabilité juridique garantie.',
  );
  line(`Clé technique PREUVIX : ${detail.attestation.keyId}`);
  doc.setTitle(`PREUVIX — ${m.title} — version ${m.version}`);
  doc.setAuthor('PREUVIX');
  const pages = doc.getPages();
  pages.forEach((current, index) => {
    current.drawLine({
      start: { x: 45, y: 40 },
      end: { x: 550, y: 40 },
      thickness: 0.5,
      color: rgb(0.8, 0.75, 0.7),
    });
    current.drawText(`PREUVIX · ${m.id} · v${m.version}`, { x: 45, y: 26, size: 7, font });
    const number = `${index + 1} / ${pages.length}`;
    current.drawText(number, { x: 550 - font.widthOfTextAtSize(number, 8), y: 26, size: 8, font });
  });
  return Buffer.from(await doc.save());
}

export async function caseArchive(
  store: Store,
  detail: CaseDetail,
  attest: (object: object) => Attestation,
  includeOriginals: boolean,
) {
  const files: Record<string, Uint8Array> = {};
  const json = (value: unknown) => Buffer.from(canonicalJson(value));
  let total = 0;
  for (const file of detail.manifest.files) {
    const row = store.get(file.proofId)!;
    files[`preuves/${file.proofId}/manifest.json`] = Buffer.from(row.manifest);
    const proof = store.summary(row);
    if (proof.attestation)
      files[`preuves/${file.proofId}/attestation.json`] = json(proof.attestation);
    if (row.tsr) files[`preuves/${file.proofId}/timestamp.tsr`] = row.tsr;
    if (row.tsq) files[`preuves/${file.proofId}/timestamp.tsq`] = row.tsq;
    if (includeOriginals) {
      total += row.original.byteLength;
      if (total > 100 * 1024 * 1024)
        throw new CaseError(
          413,
          'Export des originaux limité à 100 Mo. Téléchargez le récapitulatif sans originaux et les fichiers séparément.',
        );
      files[`preuves/${file.proofId}/original.${file.file.mime.split('/')[1]}`] = row.original;
    }
  }
  files['dossier.json'] = json(detail.manifest);
  files['dossier-attestation.json'] = json(detail.attestation);
  files['rapport.pdf'] = await caseReport(detail);
  for (const operation of detail.operations) {
    if (operation.result?.otsProofBase64) {
      const proof = Buffer.from(operation.result.otsProofBase64, 'base64');
      if (hash(proof) !== operation.result.otsProofSha256)
        throw new CaseError(409, 'Preuve blockchain altérée.');
      files['dossier.json.ots'] = proof;
      files['VERIFIER-BITCOIN.txt'] = Buffer.from(
        'OpenTimestamps / Bitcoin (gratuit)\nots upgrade dossier.json.ots\nots verify dossier.json.ots\nUne preuve en attente ne constitue pas une confirmation Bitcoin.\nPREUVIX vérifie la racine de Merkle avec deux explorateurs publics ; pour une vérification indépendante, utilisez votre propre nœud Bitcoin avec le client OpenTimestamps.\n',
      );
    }
    const row = store.db
      .prepare('SELECT source_pdf,signed_pdf,tsq,tsr FROM case_operations WHERE id=?')
      .get(operation.id) as Record<string, Uint8Array | null>;
    for (const [column, expected] of [
      ['source_pdf', operation.result?.sourceDocumentSha256],
      ['signed_pdf', operation.result?.signedDocumentSha256],
      ['tsr', operation.result?.timestamp?.responseSha256],
    ] as const) {
      if (expected && (!row[column] || hash(row[column]!) !== expected))
        throw new CaseError(409, 'Un justificatif enregistré a été altéré.');
    }
    for (const [column, name] of [
      ['source_pdf', 'document-a-signer.pdf'],
      ['signed_pdf', 'document-retourne-signe.pdf'],
      ['tsq', 'timestamp.tsq'],
      ['tsr', 'timestamp.tsr'],
    ])
      if (row[column]) files[`justificatifs/${operation.kind}/${name}`] = row[column]!;
  }
  const envelope = {
    schema: 'preuvix-case-export/1',
    serialization: 'PREUVIX-JSON-v1',
    exportedAt: new Date().toISOString(),
    dossier: detail.manifest,
    dossierSha256: detail.manifestHash,
    services: detail.operations,
    originalsIncluded: includeOriginals,
    artifacts: Object.entries(files)
      .map(([name, bytes]) => ({ path: name, sha256: hash(bytes), bytes: bytes.byteLength }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  const serialized = canonicalJson(envelope),
    signature = attest(JSON.parse(serialized));
  files['manifest.json'] = Buffer.from(serialized);
  files['manifest.sha256'] = Buffer.from(hash(serialized));
  files['attestation.json'] = json(signature);
  files['signer-public.pem'] = Buffer.from(signature.publicKey);
  files['manifest.sig'] = Buffer.from(signature.signature, 'base64');
  return Buffer.from(zipSync(files, { level: 0 }));
}
