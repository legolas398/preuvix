import 'dotenv/config';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { promisify } from 'node:util';

// Local checks only. No request or purchase is made at the timestamp provider.
const required = ['TSA_URL', 'TSA_NAME', 'TSA_CA_FILE', 'TSA_POLICY_OID', 'TSA_SIGNER_SHA256'];
const missing = required.filter((name) => !process.env[name]);
let valid = true;
const fail = (message: string) => {
  valid = false;
  console.log(`À compléter : ${message}`);
};
if (missing.length) fail(missing.join(', '));
if (process.env.TSA_URL) {
  try {
    if (new URL(process.env.TSA_URL).protocol !== 'https:') fail('TSA_URL doit utiliser HTTPS.');
  } catch {
    fail('TSA_URL doit être une URL HTTPS valide.');
  }
}
if (process.env.TSA_POLICY_OID && !/^\d+(\.\d+)+$/.test(process.env.TSA_POLICY_OID))
  fail('TSA_POLICY_OID doit être un OID numérique.');
if (
  process.env.TSA_SIGNER_SHA256 &&
  !/^[a-f0-9]{64}$/i.test(process.env.TSA_SIGNER_SHA256.replace(/:/g, ''))
)
  fail('TSA_SIGNER_SHA256 doit contenir 64 caractères hexadécimaux.');
if (process.env.TSA_CA_FILE) {
  try {
    const pem = await readFile(process.env.TSA_CA_FILE, 'utf8');
    const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    if (!certificates?.length) throw new Error();
    certificates.forEach((cert) => new X509Certificate(cert));
    console.log(
      `Bundle CA lisible : ${certificates.length} certificat(s). Leur confiance doit être établie indépendamment.`,
    );
  } catch {
    fail('TSA_CA_FILE doit pointer vers un bundle de certificats PEM lisible.');
  }
}
try {
  const { stdout } = await promisify(execFile)(process.env.OPENSSL_BIN || 'openssl', ['version'], {
    windowsHide: true,
    timeout: 5000,
  });
  if (!/^OpenSSL 3\./.test(stdout)) fail('OpenSSL 3 est requis pour ce pilote.');
  else console.log('OpenSSL 3 : disponible.');
} catch {
  fail('OpenSSL est introuvable. Définissez OPENSSL_BIN ou installez OpenSSL 3.');
}
if (
  !process.env.TSA_TRUST_LIST_URL ||
  !(Date.parse(process.env.TSA_REVIEW_VALID_UNTIL || '') > Date.now())
) {
  fail(
    'Documentez une revue courante du service qualifié : TSA_TRUST_LIST_URL et TSA_REVIEW_VALID_UNTIL.',
  );
}
console.log('Aucun appel externe effectué. Les secrets ne sont pas affichés.');
console.log(
  valid
    ? 'Configuration locale prête pour un essai réel. La validité des accès et la qualification du service restent à vérifier avec le prestataire.'
    : 'Horodatage indépendant non prêt. Les dépôts restent possibles en mode local, avec le statut « en attente ».',
);
process.exitCode = valid ? 0 : 1;
