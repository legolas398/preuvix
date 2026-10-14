import { backup, DatabaseSync } from 'node:sqlite';
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const database = 'preuvix.sqlite';
const keyFile = 'attestation-ed25519.pem';
const manifestFile = 'backup-manifest.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function regularFile(file) {
  if (!(await lstat(file)).isFile()) throw new Error('Backup refuses links and non-regular files.');
}
function checkDatabase(directory) {
  const db = new DatabaseSync(path.join(directory, database), { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
      throw new Error('SQLite integrity check failed.');
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('SQLite foreign key check failed.');
    return db.prepare('SELECT key_id FROM active_signing_key WHERE id=1').get()?.key_id;
  } finally {
    db.close();
  }
}
async function checkKey(directory) {
  const pinned = checkDatabase(directory);
  const privateKey = createPrivateKey(await readFile(path.join(directory, keyFile)));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Invalid signing key.');
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  if (!pinned || pinned !== sha256(publicKey))
    throw new Error('Backup signing key does not match the database.');
}
async function newDestination(source, destination) {
  const sourcePath = await realpath(source);
  const parent = await realpath(path.dirname(path.resolve(destination)));
  const target = path.join(parent, path.basename(destination));
  const relative = path.relative(sourcePath, target);
  if (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
    throw new Error('Destination must be outside the source directory.');
  await mkdir(target, { mode: 0o700 }); // Existing destinations are always refused.
  return target;
}

export async function createBackup(source, destination) {
  await regularFile(path.join(source, database));
  await regularFile(path.join(source, keyFile));
  const target = await newDestination(source, destination);
  const before = await digest(path.join(source, keyFile));
  const db = new DatabaseSync(path.join(source, database), { readOnly: true });
  try {
    await backup(db, path.join(target, database));
  } finally {
    db.close();
  }
  await chmod(path.join(target, database), 0o600);
  // All durable auxiliary files live at DATA_DIR's root. Models are downloadable cache.
  const names = [database];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (
      [database, `${database}-wal`, `${database}-shm`, `${database}-journal`].includes(entry.name)
    )
      continue;
    if (entry.name === 'models' && entry.isDirectory()) continue;
    if (!entry.isFile() || entry.name === manifestFile)
      throw new Error('Unexpected data entry; review backup coverage before continuing.');
    await copyFile(path.join(source, entry.name), path.join(target, entry.name));
    await chmod(path.join(target, entry.name), 0o600);
    names.push(entry.name);
  }
  if (before !== (await digest(path.join(source, keyFile))))
    throw new Error('Signing key changed during backup. Retry while the app is stopped.');
  await checkKey(target);
  const files = [];
  for (const name of names.sort())
    files.push({ name, sha256: await digest(path.join(target, name)) });
  await writeFile(
    path.join(target, manifestFile),
    JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return { files: files.length, verified: true };
}

export async function verifyBackup(source) {
  await regularFile(path.join(source, manifestFile));
  const manifest = JSON.parse(await readFile(path.join(source, manifestFile), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files))
    throw new Error('Invalid backup manifest.');
  const names = new Set();
  for (const file of manifest.files) {
    if (
      typeof file.name !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file.name) ||
      file.name === manifestFile ||
      names.has(file.name) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error('Invalid backup entry.');
    names.add(file.name);
    const location = path.join(source, file.name);
    await regularFile(location);
    if ((await digest(location)) !== file.sha256) throw new Error('Backup checksum mismatch.');
  }
  if (!names.has(database) || !names.has(keyFile)) throw new Error('Incomplete backup.');
  if ((await readdir(source)).some((name) => name !== manifestFile && !names.has(name)))
    throw new Error('Unexpected backup file.');
  await checkKey(source);
  return manifest;
}

export async function restoreBackup(source, destination) {
  const manifest = await verifyBackup(source);
  const target = await newDestination(source, destination);
  for (const file of manifest.files) {
    await copyFile(path.join(source, file.name), path.join(target, file.name));
    await chmod(path.join(target, file.name), 0o600);
    if ((await digest(path.join(target, file.name))) !== file.sha256)
      throw new Error('Restored checksum mismatch.');
  }
  await checkKey(target);
  // Recovered devices must authenticate again; existing evidence remains byte-identical.
  const db = new DatabaseSync(path.join(target, database));
  try {
    db.exec('DELETE FROM sessions; DELETE FROM capture_sessions;');
  } finally {
    db.close();
  }
  return { files: manifest.files.length, verified: true, sessionsRevoked: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, source, destination] = process.argv.slice(2);
  try {
    if (!source || (command !== 'verify' && !destination))
      throw new Error(
        'Usage: node scripts/backup.mjs create|restore SOURCE NEW_DESTINATION; or verify SNAPSHOT',
      );
    if (command === 'create') console.log(JSON.stringify(await createBackup(source, destination)));
    else if (command === 'restore')
      console.log(JSON.stringify(await restoreBackup(source, destination)));
    else if (command === 'verify') {
      await verifyBackup(source);
      console.log('Backup verified.');
    } else throw new Error('Unknown backup command.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
