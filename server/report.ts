import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { Proof } from '../shared/types';
import { certificationLabels } from '../shared/certification-policy';

const safeText = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u00ab\u00bb\u201c\u201d]/g, '"')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[^\x20-\x7e\n]/g, '?');

export async function makeReport(proof: Proof, origin: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 786;
  const line = (text: string, size = 10, strong = false) => {
    const selectedFont = strong ? bold : font;
    // Character wrapping also handles long hashes and user-supplied unbroken text.
    for (const paragraph of safeText(text).split('\n')) {
      let current = '';
      for (const char of paragraph) {
        if (selectedFont.widthOfTextAtSize(current + char, size) > 490) {
          if (y < 65) {
            page = pdf.addPage([595, 842]);
            y = 785;
          }
          page.drawText(current, {
            x: 52,
            y,
            size,
            font: selectedFont,
            color: rgb(0.1, 0.2, 0.17),
          });
          y -= size + 7;
          current = '';
        }
        current += char;
      }
      if (y < 65) {
        page = pdf.addPage([595, 842]);
        y = 785;
      }
      page.drawText(current, { x: 52, y, size, font: selectedFont, color: rgb(0.1, 0.2, 0.17) });
      y -= size + 7;
    }
  };
  line('PREUVIX', 25, true);
  line('RAPPORT TECHNIQUE DE DEPOT', 12, true);
  line("ATTESTATION TECHNIQUE DE CAPTURE ET D'INTEGRITE", 12, true);
  line('Ce rapport ne constitue pas un constat de commissaire de justice.');
  y -= 14;
  line(proof.manifest.title, 16, true);
  line(`Identifiant : ${proof.id}`);
  line(`Reception serveur (non qualifiee) : ${proof.manifest.receivedAt}`);
  line(
    `Origine declaree : ${proof.manifest.source === 'camera' ? 'camera du navigateur' : 'fichier importe'}`,
  );
  line(`Fichier : ${proof.manifest.file.name} (${proof.manifest.file.size} octets)`);
  line(`SHA-256 du fichier : ${proof.manifest.file.sha256}`);
  line(`SHA-256 du manifeste JSON exact : ${proof.manifestHash}`);
  y -= 10;
  line('PROTOCOLE DE CAPTURE', 12, true);
  if (proof.manifest.certification) {
    line('PROCESSUS DE CERTIFICATION PHOTO / VIDEO', 12, true);
    line(certificationLabels[proof.manifest.certification.status]);
    for (const check of proof.manifest.certification.checks)
      line(
        `${check.result === 'passed' ? 'Controle' : check.result === 'review' ? 'A examiner' : 'Non etabli'} : ${check.detail}`,
      );
    line(`Politique : ${proof.manifest.certification.policy}`);
    line(
      proof.manifest.certification.aiAuthenticity === 'camera_provenance_verified'
        ? 'Evaluation incluse dans le manifeste signe. Origine materielle attestee par la signature de l appareil ; la mise en scene reste possible.'
        : 'Evaluation incluse dans le manifeste signe. Absence d IA non etablie.',
    );
  }
  const credentials = proof.manifest.provenance.contentCredentials;
  if (credentials && credentials.state !== 'absent') {
    line(`Content Credentials (C2PA) : ${credentials.state}`);
    if (credentials.signer)
      line(
        `Signataire : ${credentials.signer.commonName ?? '?'} / emetteur ${credentials.signer.issuer ?? '?'} / ${credentials.signer.time ?? 'date non signee'}`,
      );
    if (credentials.claimGenerator) line(`Generateur declare : ${credentials.claimGenerator}`);
    if (credentials.digitalSourceTypes.length)
      line(`Type de source declare : ${credentials.digitalSourceTypes.join(', ')}`);
  }
  for (const { review } of proof.reviews ?? [])
    line(
      `Verification visuelle du defi (${review.reviewedAt}) par ${review.reviewer}, nom declare : ${review.outcome === 'confirmed' ? 'defi visible et conforme' : review.outcome === 'absent' ? 'defi absent ou non conforme' : 'defi illisible ou incertain'}${review.note ? ` - ${review.note}` : ''}. Signee separement (Ed25519).`,
    );
  if (proof.manifest.capture) {
    const capture = proof.manifest.capture;
    line(`Session serveur : ${capture.id}`);
    line(`Defi aleatoire : ${capture.nonce}`);
    if (capture.challenge)
      line(
        `Defi en direct a montrer dans l image : code ${capture.challenge.code}, geste "${capture.challenge.gesture}". Engagement ${capture.elapsedSeconds ?? '?'} s apres emission (limite ${capture.challenge.maxSeconds} s).`,
      );
    line(`Ouverture serveur : ${capture.issuedAt}`);
    line(`Engagement de l'empreinte recu par le serveur : ${capture.committedAt}`);
    line(`Debut / fin declares par le navigateur : ${capture.startedAt} / ${capture.endedAt}`);
    line(
      'Le serveur a lie cette session a cette empreinte. Il ne certifie pas la camera physique, la scene, les dates declarees ou l absence de camera virtuelle.',
    );
  } else line('Pas de session de capture engagee. Origine declaree par le deposant uniquement.');
  if (proof.manifest.file.durationSeconds)
    line(`Duree lue dans la video : ${proof.manifest.file.durationSeconds.toFixed(2)} secondes`);
  if (proof.manifest.declaration) {
    line(`Auteur declare (identite non verifiee) : ${proof.manifest.declaration.author}`);
    line(`Contexte declare : ${proof.manifest.declaration.context}`);
    line(proof.manifest.declaration.statement);
  }
  y -= 10;
  line('SIGNATURE TECHNIQUE DE L INSTALLATION', 12, true);
  if (proof.attestation) {
    line(`Algorithme : Ed25519. Empreinte de cle : ${proof.attestation.keyId}`);
    line(`Signature du manifeste : ${proof.attestation.signature}`, 8);
    line(
      'Signature verifiable dans l export ZIP : manifest.json, manifest.sig et signer-public.pem. Elle couvre les octets du manifeste, pas ce PDF. Cle auto-generee de l installation, sans identite certifiee par un tiers ni signature qualifiee eIDAS.',
    );
  } else line('Dossier anterieur : aucune signature technique enregistree.');
  y -= 10;
  line('HORODATAGE', 12, true);
  if (proof.receipt) {
    line(`Signature RFC 3161 verifiee a la reception : ${proof.receipt.time}`);
    line(`Prestataire : ${proof.receipt.provider}`);
    line(`Politique : ${proof.receipt.policyOid}`);
    line(
      `Qualification : ${proof.receipt.qualification === 'operator_reviewed' ? "service examine par l'operateur ; pas de validation eIDAS automatisee" : 'non evaluee'}`,
    );
  } else line('En attente. Aucun horodatage independant obtenu.');
  y -= 10;
  line('PROVENANCE ET GENERATION IA', 12, true);
  line(
    proof.manifest.provenance.signals.join(' ; ') ||
      'Aucun indice declaratif reconnu. Resultat inconclusif.',
  );
  line(proof.manifest.provenance.explanation);
  line(
    'Protocole anti-biais : aucun score de veracite, classement de personne ou rejet fonde sur un indice IA. Les indices declaratifs restent contestables ; leur absence est inconclusive. Une expertise humaine peut etre necessaire.',
  );
  y -= 10;
  line('PORTEE', 12, true);
  line(
    "Un hash identique etablit la correspondance des octets. Il ne prouve ni la realite de la scene, ni l'identite de son auteur, ni le lieu ou la date de capture. La date serveur est distincte de la date du jeton RFC 3161.",
  );
  line(
    "Le journal est un historique applicatif, pas un journal d'audit independant ou infalsifiable. Une suppression ne rappelle pas les copies deja exportees.",
  );
  line(
    'Recevabilite et force probante : appreciees selon les faits et la procedure. Ce document ne garantit pas une admission en justice. Documentez le contexte, la licéite de la collecte et les elements contradictoires ; sollicitez un professionnel si necessaire.',
  );
  line(
    'Reference : article 1366 du Code civil (identification et integrite de l ecrit electronique). https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042461',
    9,
  );
  if (proof.manifest.description) {
    y -= 10;
    line('DESCRIPTION DECLAREE', 12, true);
    line(proof.manifest.description);
  }
  if (proof.shareToken) {
    const url = `${origin}/verification/${proof.shareToken}`;
    if (y < 180) {
      page = pdf.addPage([595, 842]);
      y = 785;
    }
    const qr = await pdf.embedPng(await QRCode.toBuffer(url));
    page.drawImage(qr, { x: 52, y: y - 108, width: 96, height: 96 });
    y -= 125;
    line(url, 8);
    line('Lien actif uniquement tant que le partage et le dossier existent.', 9);
  } else {
    y -= 10;
    line('Partage desactive. Aucun lien public dans ce rapport.');
  }
  pdf.setTitle('PREUVIX - Rapport technique');
  pdf.setProducer('PREUVIX open source');
  return Buffer.from(await pdf.save());
}
