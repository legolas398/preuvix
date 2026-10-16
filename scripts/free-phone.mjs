import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import QRCode from 'qrcode';
import { protectSigningKey } from './protect-signing-key.mjs';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const folder = path.join(root, '.tools/free-phone');
const binary = path.join(root, '.tools/cloudflared/cloudflared.exe');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
try {
  if (!existsSync(binary) || !existsSync('dist/index.html')) throw Error('Cloudflared ou compilation du site manquante.');
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(3017, '127.0.0.1', () => probe.close(resolve));
  });
  mkdirSync(folder, { recursive: true });
  const passwordFile = path.join(folder, 'password.txt');
  if (!existsSync(passwordFile)) writeFileSync(passwordFile, randomBytes(24).toString('base64url'), { flag: 'wx', mode: 0o600 });
  protectSigningKey(passwordFile);
  const tunnel = spawn(binary, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:3017'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);
  const log = openSync(path.join(folder, 'tunnel.log'), 'a');
  const { writeSync } = await import('node:fs');
  let output = '';
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Le tunnel ne fournit pas de lien. Voir tunnel.log.')), 60000);
    const consume = (chunk) => {
      writeSync(log, chunk);
      output = (output + chunk.toString()).slice(-20000);
      const url = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
      if (url) { clearTimeout(timer); resolve(url); }
    };
    tunnel.stdout.on('data', consume);
    tunnel.stderr.on('data', consume);
    tunnel.once('error', (error) => { clearTimeout(timer); reject(error); });
    tunnel.once('exit', () => { clearTimeout(timer); reject(Error('Tunnel arrete.')); stop(1); });
  });
  const logs = ['server.log', 'server-error.log'].map(name => openSync(path.join(folder, name), 'a'));
  const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/free-phone-server.ts', origin], { windowsHide: true, stdio: ['ignore', ...logs] });
  logs.forEach(closeSync);
  children.push(server);
  server.once('error', () => stop(1));
  server.once('exit', () => stop(1));
  let ready = false;
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      const r = await fetch('http://127.0.0.1:3017/api/health', { signal: AbortSignal.timeout(3000) });
      if (r.ok && (await r.json()).service === 'preuvix') { ready = true; break; }
    } catch { /* Wait for TLS routing and backend initialization. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw Error('Serveur local non joignable. Voir les journaux dans .tools/free-phone.');
  writeFileSync(path.join(folder, 'url.txt'), origin);
  writeFileSync(path.join(folder, 'processes.json'), JSON.stringify({ launcher: process.pid, tunnel: tunnel.pid, server: server.pid, origin }));
  await QRCode.toFile(path.join(folder, 'qr.png'), origin, { width: 360 });
  const qr = await QRCode.toDataURL(origin, { width: 320 });
  writeFileSync(path.join(folder, 'ouvrir-sur-telephone.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Tester PREUVIX</title><body style="font:20px sans-serif;max-width:650px;margin:40px auto"><h1>Tester PREUVIX gratuitement</h1><p>Scanne ce QR code avec ton téléphone.</p><img src="${qr}" alt="QR code du lien PREUVIX"><p><a href="${origin}">${origin}</a></p><p>Le mot de passe est dans password.txt, dans ce même dossier.</p><p><a href="${origin}/api/test-android.apk">Télécharger directement l'application Android</a> une fois sa compilation terminée. Connecte-toi ensuite dans l'application.</p><p>Garde le PC allumé et le tunnel ouvert. Le lien change à chaque relance.</p></body></html>`);
  console.log(`PREUVIX HTTPS : ${origin}\nMot de passe : .tools/free-phone/password.txt\nQR code : .tools/free-phone/ouvrir-sur-telephone.html\nGarder cette fenetre ouverte. Ctrl+C arrete le tunnel.`);
} catch (error) { console.error(error.message); stop(1); }
