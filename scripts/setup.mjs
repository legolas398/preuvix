import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const password = randomBytes(24).toString('base64url');
try {
  await writeFile(
    '.env',
    `OWNER_PASSWORD=${password}\nAPP_ORIGIN=http://localhost:3000\nHOST=127.0.0.1\nPORT=3000\nDATA_DIR=./data\nMAX_STORAGE_MB=500\nCOOKIE_SECURE=false\nREQUIRE_TIMESTAMP=true\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Configuration locale créée dans .env.\nVotre mot de passe : ' +
      password +
      '\nConservez-le dans votre gestionnaire de mots de passe.\nLancez npm run dev. Les dépôts resteront en attente sans prestataire RFC 3161.',
  );
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env existe déjà ; aucun changement effectué.');
  else throw error;
}
