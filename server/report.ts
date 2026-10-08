import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Proof } from '../shared/types';
import { certificationLabels } from '../shared/certification-policy';
import { shortId } from '../shared/format';
import { hash } from './integrity';
import { locationDescription } from '../shared/capture';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static') as string;
const exec = promisify(execFile);
const fontFile = (family: string, weight: number) =>
  readFileSync(
    require.resolve(`@fontsource/${family}/files/${family}-latin-${weight}-normal.woff`),
  );
const FONTS = {
  body: fontFile('manrope', 400),
  bold: fontFile('manrope', 700),
  display: fontFile('syne', 700),
};

const C = {
  ink: rgb(0.286, 0.161, 0.09),
  muted: rgb(0.47, 0.36, 0.306),
  accent: rgb(0.678, 0.294, 0.094),
  soft: rgb(0.988, 0.906, 0.831),
  paper: rgb(1, 0.988, 0.973),
  line: rgb(0.914, 0.804, 0.722),
  band: rgb(0.2, 0.118, 0.071),
  white: rgb(1, 1, 1),
  passed: rgb(0.184, 0.478, 0.31),
  review: rgb(0.784, 0.471, 0.075),
  unverified: rgb(0.58, 0.58, 0.56),
};
type Result = 'passed' | 'review' | 'unverified';
const resultColor = (result: Result) => C[result];
const resultLabel = { passed: 'Contrôlé', review: 'À examiner', unverified: 'Non établi' };

const W = 595;
const H = 842;
const M = 48;
const CONTENT = W - 2 * M;

// Stable, human-readable report reference derived from the signed manifest.
export const reportReference = (manifestHash: string) =>
  `PVX-${hash(`preuvix-report:${manifestHash}`).slice(0, 12).toUpperCase().match(/.{4}/g)!.join('-')}`;

const paris = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Europe/Paris',
  }).format(new Date(value));

async function thumbnail(proof: Proof, original: Buffer) {
  try {
    if (proof.manifest.file.mime.startsWith('image/'))
      return await sharp(original, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(520, 520, { fit: 'inside' })
        .jpeg({ quality: 82 })
        .toBuffer();
    const directory = await mkdtemp(path.join(tmpdir(), 'preuvix-thumb-'));
    try {
      const input = path.join(directory, `original.${proof.manifest.file.mime.split('/')[1]}`);
      const output = path.join(directory, 'frame.jpg');
      await writeFile(input, original);
      await exec(
        ffmpeg,
        [
          '-v',
          'error',
          '-nostdin',
          '-protocol_whitelist',
          'file,pipe',
          '-ss',
          String(Math.min(1, (proof.manifest.file.durationSeconds ?? 0) / 2)),
          '-i',
          input,
          '-frames:v',
          '1',
          '-vf',
          'scale=520:-2',
          output,
        ],
        { timeout: 20000, windowsHide: true },
      );
      return await sharp(readFileSync(output)).jpeg({ quality: 82 }).toBuffer();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  } catch {
    return null; // The report stays valid without a preview.
  }
}

class Layout {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly pdf: PDFDocument,
    readonly fonts: { body: PDFFont; bold: PDFFont; display: PDFFont },
    readonly supports: (codePoint: number) => boolean,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.pdf.addPage([W, H]);
    this.y = H - 60;
  }
  ensure(height: number) {
    if (this.y - height < 70) this.newPage();
  }
  clean(text: string) {
    return [...text.replace(/\t/g, ' ')]
      .map((char) => (char === '\n' || this.supports(char.codePointAt(0)!) ? char : '?'))
      .join('');
  }
  lines(text: string, font: PDFFont, size: number, width: number) {
    const out: string[] = [];
    for (const paragraph of this.clean(text).split('\n')) {
      let current = '';
      for (const word of paragraph.split(' ')) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          current = candidate;
          continue;
        }
        if (current) out.push(current);
        // Hashes and long identifiers are broken by character.
        current = '';
        for (const char of word) {
          if (font.widthOfTextAtSize(current + char, size) > width) {
            out.push(current);
            current = '';
          }
          current += char;
        }
      }
      out.push(current);
    }
    return out;
  }
  text(
    value: string,
    options: {
      size?: number;
      font?: PDFFont;
      color?: RGB;
      x?: number;
      width?: number;
      gap?: number;
    } = {},
  ) {
    const { size = 9.5, font = this.fonts.body, color = C.ink, x = M, width = CONTENT } = options;
    const lineHeight = size * 1.45;
    for (const line of this.lines(value, font, size, width)) {
      this.ensure(lineHeight);
      this.page.drawText(line, { x, y: this.y - size, size, font, color });
      this.y -= lineHeight;
    }
    this.y -= options.gap ?? 4;
  }
  heading(number: string, title: string) {
    this.ensure(60);
    this.y -= 14;
    this.page.drawText(number, {
      x: M,
      y: this.y - 9,
      size: 8,
      font: this.fonts.bold,
      color: C.accent,
    });
    this.page.drawText(this.clean(title), {
      x: M + 24,
      y: this.y - 12,
      size: 14,
      font: this.fonts.display,
      color: C.ink,
    });
    this.y -= 22;
    this.page.drawLine({
      start: { x: M, y: this.y },
      end: { x: W - M, y: this.y },
      thickness: 0.6,
      color: C.line,
    });
    this.y -= 10;
  }
  field(label: string, value: string, width = CONTENT) {
    const labelWidth = 128;
    const valueLines = this.lines(value, this.fonts.body, 9, width - labelWidth);
    const height = valueLines.length * 13 + 5;
    this.ensure(height);
    this.page.drawText(this.clean(label), {
      x: M,
      y: this.y - 9,
      size: 8,
      font: this.fonts.bold,
      color: C.muted,
    });
    valueLines.forEach((line, index) =>
      this.page.drawText(line, {
        x: M + labelWidth,
        y: this.y - 9 - index * 13,
        size: 9,
        font: this.fonts.body,
        color: C.ink,
      }),
    );
    this.y -= height;
  }
  // Timeline / check row with a coloured status marker.
  step(result: Result | 'pending', title: string, detail: string, when?: string) {
    const color = result === 'pending' ? C.unverified : resultColor(result);
    const detailLines = this.lines(detail, this.fonts.body, 8.5, CONTENT - 30);
    const height = 16 + detailLines.length * 12 + (when ? 12 : 0) + 6;
    this.ensure(height);
    const top = this.y;
    this.page.drawCircle({
      x: M + 6,
      y: top - 7,
      size: 5,
      color: result === 'passed' ? color : undefined,
      borderColor: color,
      borderWidth: 1.4,
    });
    this.page.drawText(this.clean(title), {
      x: M + 22,
      y: top - 10,
      size: 10,
      font: this.fonts.bold,
      color: C.ink,
    });
    const tag = result === 'pending' ? 'En attente' : resultLabel[result];
    const tagWidth = this.fonts.bold.widthOfTextAtSize(tag, 7.5);
    this.page.drawText(tag, {
      x: W - M - tagWidth,
      y: top - 10,
      size: 7.5,
      font: this.fonts.bold,
      color,
    });
    let y = top - 24;
    if (when) {
      this.page.drawText(this.clean(when), {
        x: M + 22,
        y,
        size: 8,
        font: this.fonts.body,
        color: C.accent,
      });
      y -= 12;
    }
    for (const line of detailLines) {
      this.page.drawText(line, { x: M + 22, y, size: 8.5, font: this.fonts.body, color: C.muted });
      y -= 12;
    }
    this.y = y - 6;
  }
}

export async function makeReport(proof: Proof, origin: string, original: Buffer) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = {
    body: await pdf.embedFont(FONTS.body, { subset: true }),
    bold: await pdf.embedFont(FONTS.bold, { subset: true }),
    display: await pdf.embedFont(FONTS.display, { subset: true }),
  };
  const glyphs = fontkit.create(FONTS.body);
  const doc = new Layout(pdf, fonts, (cp) => glyphs.hasGlyphForCodePoint(cp));
  const { manifest } = proof;
  const certification = manifest.certification;
  const reference = reportReference(proof.manifestHash);
  const issuedAt = new Date().toISOString();
  const id = shortId(proof.id);

  // ── Cover band ──
  const page = doc.page;
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: C.band });
  page.drawText('preuvix', { x: M, y: H - 56, size: 26, font: fonts.display, color: C.white });
  page.drawText('.', {
    x: M + fonts.display.widthOfTextAtSize('preuvix', 26),
    y: H - 56,
    size: 26,
    font: fonts.display,
    color: rgb(1, 0.6, 0.27),
  });
  const right = (text: string, y: number, size: number, font: PDFFont, color: RGB) =>
    page.drawText(text, { x: W - M - font.widthOfTextAtSize(text, size), y, size, font, color });
  right('RAPPORT DE CERTIFICATION', H - 44, 9, fonts.bold, C.white);
  right(`Réf. ${reference}`, H - 58, 8.5, fonts.body, rgb(1, 0.85, 0.72));
  right(`Dossier ${id}`, H - 71, 8.5, fonts.body, rgb(1, 0.85, 0.72));
  doc.y = H - 120;

  // ── Title, status and preview ──
  const preview = await thumbnail(proof, original);
  let image: PDFImage | null = null;
  if (preview) image = await pdf.embedJpg(preview).catch(() => null); // The report stays valid without it.
  const textWidth = image ? CONTENT - 190 : CONTENT;
  const top = doc.y;
  doc.text(manifest.title, { size: 20, font: fonts.display, width: textWidth, gap: 2 });
  doc.text(`Déposé le ${paris(manifest.receivedAt)} (heure de Paris)`, {
    size: 9,
    color: C.muted,
    width: textWidth,
    gap: 12,
  });
  if (certification) {
    const label = certificationLabels[certification.status];
    const strong = certification.aiAuthenticity === 'camera_provenance_verified';
    const reviewed = proof.reviews?.at(-1)?.review;
    const tone =
      certification.status === 'review_required'
        ? C.review
        : certification.status === 'camera_signed' || certification.status === 'capture_challenged'
          ? C.passed
          : C.unverified;
    const lines = doc.lines(label, fonts.bold, 11, textWidth - 34);
    const explanation = doc.lines(
      (strong
        ? 'Origine matérielle attestée par la signature de l’appareil. La mise en scène reste possible.'
        : 'Intégrité et processus documentés. L’absence d’IA n’est pas établie par ce seul rapport.') +
        (reviewed
          ? ` Défi vérifié visuellement le ${paris(reviewed.reviewedAt)} : ${reviewed.outcome === 'confirmed' ? 'visible et conforme' : reviewed.outcome === 'absent' ? 'absent ou non conforme' : 'illisible ou incertain'}.`
          : ''),
      fonts.body,
      8.5,
      textWidth - 34,
    );
    const boxHeight = 20 + lines.length * 15 + explanation.length * 12;
    doc.page.drawRectangle({
      x: M,
      y: doc.y - boxHeight,
      width: textWidth,
      height: boxHeight,
      color: C.soft,
      borderColor: C.line,
      borderWidth: 0.6,
    });
    doc.page.drawRectangle({
      x: M,
      y: doc.y - boxHeight,
      width: 4,
      height: boxHeight,
      color: tone,
    });
    let y = doc.y - 18;
    for (const line of lines) {
      doc.page.drawText(line, { x: M + 18, y, size: 11, font: fonts.bold, color: C.ink });
      y -= 15;
    }
    for (const line of explanation) {
      doc.page.drawText(line, { x: M + 18, y, size: 8.5, font: fonts.body, color: C.muted });
      y -= 12;
    }
    doc.y -= boxHeight + 10;
  }
  if (image) {
    const scale = Math.min(170 / image.width, 170 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = W - M - width;
    page.drawRectangle({
      x: x - 4,
      y: top - height - 4,
      width: width + 8,
      height: height + 8,
      color: C.paper,
      borderColor: C.line,
      borderWidth: 0.6,
    });
    page.drawImage(image, { x, y: top - height, width, height });
    page.drawText(
      manifest.file.mime.startsWith('video/') ? 'Image extraite de la vidéo' : 'Aperçu réduit',
      { x, y: top - height - 16, size: 7, font: fonts.body, color: C.muted },
    );
    doc.y = Math.min(doc.y, top - height - 26);
  }

  // ── 1. Summary ──
  doc.heading('01', 'Synthèse du dossier');
  doc.field('Identifiant', `${id} · ${proof.id}`);
  doc.field(
    'Origine',
    manifest.capture
      ? `Capture via la caméra Preuvix (session ${manifest.capture.id.slice(0, 8)})`
      : 'Fichier importé par le déposant',
  );
  doc.field(
    'Fichier',
    `${manifest.file.name} · ${manifest.file.mime} · ${manifest.file.width} × ${manifest.file.height}${manifest.file.durationSeconds ? ` · ${manifest.file.durationSeconds.toFixed(1)} s` : ''} · ${(manifest.file.size / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Mo`,
  );
  doc.field('Empreinte SHA-256', manifest.file.sha256);
  doc.field('Manifeste SHA-256', proof.manifestHash);
  doc.field(
    'Horodatage',
    proof.receipt
      ? `Jeton RFC 3161 du ${paris(proof.receipt.time)} · ${proof.receipt.provider}`
      : 'En attente : aucun horodatage indépendant obtenu',
  );
  doc.field(
    'Signature Preuvix',
    proof.attestation
      ? `Ed25519 · clé ${proof.attestation.keyId.slice(0, 16)}…`
      : 'Dossier antérieur, non signé',
  );
  doc.field(
    'Copie protégée',
    proof.watermarked ? 'Émise : filigrane invisible TrustMark relié à ce dossier' : 'Non émise',
  );

  // ── 2. Process ──
  doc.heading('02', 'Processus de certification');
  const capture = manifest.capture;
  doc.field('Localisation à la prise de vue', locationDescription(capture?.location?.start));
  if (capture?.kind === 'video')
    doc.field('Localisation en fin de vidéo', locationDescription(capture.location?.end));
  doc.text(
    'Les positions sont déclarées par le navigateur et incluses dans le manifeste signé. Leur précision est annoncée par l’appareil ; le lieu réel de la scène et le GPS ne sont pas authentifiés.',
  );
  const credentials = manifest.provenance.contentCredentials;
  const checks = Object.fromEntries(
    (certification?.checks ?? []).map((check) => [check.id, check]),
  );
  if (capture) {
    doc.step(
      'passed',
      'Session de capture ouverte par le serveur',
      capture.challenge
        ? `Défi en direct émis : code « ${capture.challenge.code} » et geste « ${capture.challenge.gesture} », à montrer dans l’image.`
        : 'Session aléatoire liée à la connexion du déposant.',
      paris(capture.issuedAt),
    );
    doc.step(
      capture.challenge && (capture.elapsedSeconds ?? Infinity) > capture.challenge.maxSeconds
        ? 'review'
        : 'passed',
      'Empreinte engagée auprès du serveur',
      `Le navigateur a calculé le SHA-256 du média et l’a engagé ${capture.elapsedSeconds !== undefined ? `${capture.elapsedSeconds} s après l’émission du défi (limite ${capture.challenge?.maxSeconds ?? '-'} s)` : 'pendant la session'}. Cet engagement est immuable.`,
      paris(capture.committedAt),
    );
  } else
    doc.step(
      'unverified',
      'Import d’un fichier existant',
      'Aucune session de capture : l’origine du fichier est déclarée par le déposant.',
    );
  doc.step(
    'passed',
    'Réception, décodage et empreinte serveur',
    'Le serveur a décodé intégralement le média, recalculé son SHA-256 et conservé les octets reçus sans transformation.',
    paris(manifest.receivedAt),
  );
  doc.step(
    (checks.c2pa?.result as Result) ?? 'unverified',
    'Contrôle de signature d’appareil (C2PA)',
    checks.c2pa?.detail ??
      (credentials
        ? `Résultat : ${credentials.state}.`
        : 'Contrôle non disponible pour ce dossier antérieur.'),
  );
  doc.step(
    proof.attestation ? 'passed' : 'unverified',
    'Évaluation figée et manifeste signé par Preuvix',
    `Politique ${certification?.policy ?? 'non renseignée'} incluse dans le manifeste, puis signature Ed25519 de ses octets exacts.`,
    paris(manifest.receivedAt),
  );
  doc.step(
    proof.receipt ? 'passed' : 'pending',
    'Horodatage indépendant RFC 3161',
    proof.receipt
      ? `Jeton signé par ${proof.receipt.provider}, vérifié à la réception.`
      : 'Aucun prestataire n’a encore horodaté ce manifeste. Aucune date qualifiée n’est inventée.',
    proof.receipt ? paris(proof.receipt.time) : undefined,
  );
  if (capture?.challenge) {
    const reviews = proof.reviews ?? [];
    const last = reviews.at(-1)?.review;
    doc.step(
      !last ? 'pending' : last.outcome === 'confirmed' ? 'passed' : 'review',
      'Vérification visuelle du défi en direct',
      last
        ? reviews
            .map(
              ({ review }) =>
                `${review.outcome === 'confirmed' ? 'Défi visible et conforme' : review.outcome === 'absent' ? 'Défi absent ou non conforme' : 'Défi illisible ou incertain'} — ${review.reviewer} (nom déclaré)${review.note ? ` : ${review.note}` : ''}. Vérification signée séparément.`,
            )
            .join('\n')
        : 'Aucune vérification enregistrée : la présence du code et du geste dans l’image reste à confirmer.',
      last ? paris(last.reviewedAt) : undefined,
    );
  }
  if (proof.watermarked) {
    const issued = proof.events.find((event) => event.kind === 'protected_copy_issued');
    doc.step(
      'passed',
      'Copie protégée par filigrane invisible',
      'Une copie destinée à la diffusion porte un filigrane TrustMark invisible, résistant à la recompression et au recadrage, qui renvoie à ce dossier. L’original n’est pas modifié.',
      issued ? paris(issued.at) : undefined,
    );
  }

  // ── 3. Checks ──
  if (certification) {
    doc.heading('03', 'Contrôles et indices');
    // The visual review is recorded after signing: show its latest outcome alongside.
    const lastReview = proof.reviews?.at(-1)?.review;
    for (const check of certification.checks)
      if (check.id === 'challenge' && check.result === 'review' && lastReview)
        doc.step(
          lastReview.outcome === 'confirmed' ? 'passed' : 'review',
          checkTitles.challenge,
          `${check.detail} Vérification signée du ${paris(lastReview.reviewedAt)} : ${lastReview.outcome === 'confirmed' ? 'défi visible et conforme' : lastReview.outcome === 'absent' ? 'défi absent ou non conforme' : 'défi illisible ou incertain'}.`,
        );
      else doc.step(check.result, checkTitles[check.id] ?? check.id, check.detail);
    if (manifest.provenance.signals.length)
      doc.text(`Indices relevés : ${manifest.provenance.signals.join(' ; ')}`, {
        size: 8.5,
        color: C.review,
      });
  }

  // ── 4. Declarations ──
  if (manifest.declaration || manifest.description) {
    doc.heading('04', 'Déclarations du déposant');
    if (manifest.declaration) {
      doc.field('Auteur déclaré', `${manifest.declaration.author} (identité non vérifiée)`);
      doc.field('Contexte', manifest.declaration.context);
      doc.text(`« ${manifest.declaration.statement} »`, { size: 8.5, color: C.muted, gap: 8 });
    }
    if (manifest.description) doc.field('Description', manifest.description);
  }

  // ── 5. Scope ──
  doc.heading('05', 'Portée du rapport');
  doc.text(
    'Établi : la correspondance exacte des octets avec l’empreinte enregistrée, l’intégrité du manifeste signé, le déroulé du processus ci-dessus et, le cas échéant, la signature d’appareil et l’horodatage.',
    { size: 9 },
  );
  doc.text(
    'Non établi par ce seul rapport : la réalité de la scène, l’identité du déposant, l’absence de mise en scène, de caméra virtuelle ou d’écran filmé, ni la recevabilité en justice, appréciée par le juge.',
    { size: 9 },
  );
  doc.text(
    'Ce rapport n’est ni un procès-verbal de constat de commissaire de justice, ni une signature qualifiée eIDAS. Référence : article 1366 du Code civil.',
    { size: 8.5, color: C.muted, gap: 6 },
  );

  // ── 6. Verification ──
  doc.heading('06', 'Vérifier ce dossier');
  const verifyUrl = proof.shareToken ? `${origin}/verification/${proof.shareToken}` : null;
  const qrSize = 92;
  if (verifyUrl) doc.ensure(qrSize + 10);
  const verifyTop = doc.y;
  const verifyWidth = verifyUrl ? CONTENT - qrSize - 20 : CONTENT;
  doc.text(
    '1. Demander l’export ZIP du dossier (original, manifest.json, signature, clé publique, rapport).',
    { size: 9, width: verifyWidth },
  );
  doc.text('2. Exécuter : node scripts/verify-export.mjs dossier-extrait cle-de-confiance.pem', {
    size: 9,
    width: verifyWidth,
  });
  doc.text(
    `3. Comparer l’empreinte de la clé publique avec celle publiée par l’exploitant : ${proof.attestation?.keyId ?? 'non signée'}`,
    { size: 9, width: verifyWidth },
  );
  if (verifyUrl) {
    doc.text(`Page de vérification publique : ${verifyUrl}`, {
      size: 8,
      color: C.accent,
      width: verifyWidth,
    });
    const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { margin: 1 }));
    doc.page.drawImage(qr, {
      x: W - M - qrSize,
      y: verifyTop - qrSize,
      width: qrSize,
      height: qrSize,
    });
    doc.y = Math.min(doc.y, verifyTop - qrSize - 8);
  }

  // ── Final Preuvix certificate block ──
  const lines: [string, string][] = [
    ['Dossier', `${id} — ${proof.id}`],
    ['Référence du rapport', reference],
    ['Statut', certification ? certificationLabels[certification.status] : 'Dossier antérieur'],
    ['Manifeste SHA-256', proof.manifestHash],
    ['Clé de signature', proof.attestation?.keyId ?? 'aucune'],
    ['Émis le', `${paris(issuedAt)} (heure de Paris)`],
  ];
  const rows = lines.map(([label, value]) => ({
    label,
    value: doc.lines(value, fonts.body, 8.5, CONTENT - 150),
  }));
  const blockHeight = 92 + rows.reduce((sum, row) => sum + row.value.length * 12 + 4, 0) + 30;
  doc.ensure(blockHeight + 20);
  doc.y -= 16;
  const blockTop = doc.y;
  doc.page.drawRectangle({
    x: M,
    y: blockTop - blockHeight,
    width: CONTENT,
    height: blockHeight,
    color: C.paper,
    borderColor: C.accent,
    borderWidth: 1.2,
  });
  // Seal
  const sealX = W - M - 52;
  const sealY = blockTop - 52;
  doc.page.drawCircle({ x: sealX, y: sealY, size: 34, borderColor: C.accent, borderWidth: 1.6 });
  doc.page.drawCircle({ x: sealX, y: sealY, size: 28, borderColor: C.accent, borderWidth: 0.6 });
  const sealText = (text: string, dy: number, size: number, font: PDFFont) =>
    doc.page.drawText(text, {
      x: sealX - font.widthOfTextAtSize(text, size) / 2,
      y: sealY + dy,
      size,
      font,
      color: C.accent,
    });
  sealText('preuvix', 2, 11, fonts.display);
  sealText('ATTESTÉ', -10, 6.5, fonts.bold);
  doc.page.drawText('CERTIFICAT PREUVIX', {
    x: M + 18,
    y: blockTop - 30,
    size: 9,
    font: fonts.bold,
    color: C.accent,
  });
  doc.page.drawText(doc.clean('Attestation technique de dépôt'), {
    x: M + 18,
    y: blockTop - 50,
    size: 14,
    font: fonts.display,
    color: C.ink,
  });
  const intro = doc.lines(
    'Le présent rapport a été émis par PREUVIX. Il décrit le processus suivi et l’état de certification du dossier identifié ci-dessous, tel qu’enregistré et signé par cette installation.',
    fonts.body,
    8.5,
    CONTENT - 120,
  );
  let y = blockTop - 66;
  for (const line of intro) {
    doc.page.drawText(line, { x: M + 18, y, size: 8.5, font: fonts.body, color: C.muted });
    y -= 12;
  }
  y -= 6;
  for (const row of rows) {
    doc.page.drawText(doc.clean(row.label), {
      x: M + 18,
      y,
      size: 8,
      font: fonts.bold,
      color: C.muted,
    });
    row.value.forEach((line, index) =>
      doc.page.drawText(line, {
        x: M + 132,
        y: y - index * 12,
        size: 8.5,
        font: fonts.body,
        color: C.ink,
      }),
    );
    y -= row.value.length * 12 + 4;
  }
  doc.page.drawText(
    doc.clean(
      'Signature électronique technique de l’installation, distincte d’un constat ou d’une signature qualifiée.',
    ),
    { x: M + 18, y: blockTop - blockHeight + 14, size: 7, font: fonts.body, color: C.muted },
  );
  doc.y = blockTop - blockHeight;

  // ── Footer on every page ──
  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    current.drawLine({
      start: { x: M, y: 44 },
      end: { x: W - M, y: 44 },
      thickness: 0.5,
      color: C.line,
    });
    current.drawText(`PREUVIX · Rapport de certification · ${id} · ${reference}`, {
      x: M,
      y: 30,
      size: 7.5,
      font: fonts.body,
      color: C.muted,
    });
    const label = `Page ${index + 1} / ${pages.length}`;
    current.drawText(label, {
      x: W - M - fonts.body.widthOfTextAtSize(label, 7.5),
      y: 30,
      size: 7.5,
      font: fonts.body,
      color: C.muted,
    });
  });
  pdf.setTitle(`PREUVIX — Rapport de certification ${id}`);
  pdf.setAuthor('PREUVIX');
  pdf.setSubject(`Dossier ${proof.id} · ${reference}`);
  pdf.setProducer('PREUVIX open source');
  pdf.setCreator('PREUVIX');
  return Buffer.from(await pdf.save());
}

const checkTitles: Record<string, string> = {
  decode: 'Décodage du média',
  hash: 'Empreinte des octets originaux',
  capture: 'Session de capture',
  challenge: 'Défi en direct',
  location: 'Localisation de la prise de vue',
  c2pa: 'Signature d’appareil C2PA',
  ai_metadata: 'Indices IA dans les métadonnées',
  physical_origin: 'Origine physique',
};
