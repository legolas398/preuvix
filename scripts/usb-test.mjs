import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { protectSigningKey } from './protect-signing-key.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, '.tools', 'usb-test');
const base = 'http://127.0.0.1:3016';
const identity = createHash('sha256').update(root).digest('hex');
async function health() {
  const response = await fetch(base + '/__usb/health', { signal: AbortSignal.timeout(1500) });
  const body = await response.json();
  if (!response.ok || body.service !== 'preuvix-usb-test' || body.identity !== identity) throw new Error('Le port 3016 est utilise par un autre service. Aucun processus n’a ete arrete.');
  return body;
}
async function check() {
  await health();
  const origin = 'https://localhost';
  const response = await fetch(base + '/api/mobile/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: readFileSync(path.join(folder, 'password.txt'), 'utf8').trim() }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Connexion mobile refusee (${response.status}).`);
  const { token } = await response.json();
  const headers = { Origin: origin, Authorization: `Bearer ${token}` };
  try {
    const cases = await fetch(base + '/api/cases', { headers, signal: AbortSignal.timeout(10000) });
    if (!cases.ok) throw new Error(`Lecture des dossiers refusee (${cases.status}).`);
  } finally { await fetch(base + '/api/logout', { method: 'POST', headers, signal: AbortSignal.timeout(10000) }); }
  console.log('Serveur USB OK : instance identifiee, connexion Android et lecture des dossiers validees.');
}
async function start() {
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (const name of ['password.txt', 'control.txt']) {
    const file = path.join(folder, name);
    if (!existsSync(file)) writeFileSync(file, randomBytes(24).toString('base64url') + '\n', { flag: 'wx', mode: 0o600 });
    protectSigningKey(file);
  }
  const running = await health().catch(() => null);
  if (!running) {
    const logs = ['server.log', 'server-error.log'].map((name) => openSync(path.join(folder, name), 'a'));
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/usb-test-server.ts'], {
      cwd: root, detached: true, windowsHide: true, stdio: ['ignore', ...logs],
    });
    logs.forEach(closeSync);
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline) {
      if (await health().catch(() => null)) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('Demarrage impossible. Verifiez le port 3016 et .tools/usb-test/server-error.log.');
  }
  await check();
}
try {
  const command = process.argv[2] || 'check';
  if (command === 'start') await start();
  else if (command === 'check') await check();
  else if (command === 'stop') {
    await health();
    const response = await fetch(base + '/__usb/stop', { method: 'POST', headers: { 'X-USB-Control': readFileSync(path.join(folder, 'control.txt'), 'utf8').trim() }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Arret du serveur USB refuse.');
    console.log('Arret du serveur USB demande. Les donnees sont conservees.');
  } else throw new Error('Usage : node scripts/usb-test.mjs start|check|stop');
} catch (error) { console.error(error.message); process.exitCode = 1; }
