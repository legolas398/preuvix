import { readFile, writeFile, statfs } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function inspectDeployment({
  origin,
  statusDir,
  dataDir,
  now = Date.now(),
  allowLocal = false,
  request = fetch,
}) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(
        allowLocal &&
        ['127.0.0.1', 'localhost'].includes(url.hostname) &&
        url.protocol === 'http:'
      ))
  )
    throw new Error('A valid HTTPS origin is required.');
  const issues = [];
  try {
    const response = await request(origin + '/api/health', {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    const body = await response.json();
    if (!response.ok || body.service !== 'preuvix' || body.status !== 'ready')
      issues.push('service_unavailable');
  } catch {
    issues.push('https_or_service_unavailable');
  }
  for (const [name, maxHours] of [
    ['backup', 36],
    ['restore', 35 * 24],
  ]) {
    try {
      const state = JSON.parse(
        await readFile(path.join(statusDir, name + '-success.json'), 'utf8'),
      );
      const at = Date.parse(state.completedAt);
      if (!Number.isFinite(at) || at > now + 300000 || now - at > maxHours * 3600000)
        issues.push(name + '_overdue');
    } catch {
      issues.push(name + '_not_verified');
    }
  }
  try {
    const disk = await statfs(dataDir);
    if (disk.bavail * disk.bsize < 1024 ** 3 || disk.bavail / disk.blocks < 0.1)
      issues.push('disk_space_low');
  } catch {
    issues.push('disk_check_unavailable');
  }
  return { checkedAt: new Date(now).toISOString(), healthy: !issues.length, issues };
}
export async function deliverAlert(report, { webhook, statusDir, request = fetch }) {
  if (!webhook) return 'not_configured';
  const url = new URL(webhook);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Alert webhook must use HTTPS.');
  const file = path.join(statusDir, 'monitor-alert.json');
  const previous = await readFile(file, 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  const signature = [...report.issues].sort().join(',');
  const now = Date.parse(report.checkedAt);
  if (
    (!previous && report.healthy) ||
    (previous?.signature === signature && (report.healthy || now - previous.sentAt < 6 * 3600000))
  )
    return 'unchanged';
  // No evidence, owner data, URL or secret is included in notifications.
  const response = await request(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: report.healthy
        ? 'PREUVIX: service and backup checks recovered.'
        : 'PREUVIX alert: ' + signature,
    }),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Alert delivery failed.');
  await writeFile(file, JSON.stringify({ signature, sentAt: now }), { mode: 0o600 });
  return 'sent';
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const statusDir = process.env.MONITOR_STATE_DIR || '/status';
    const report = await inspectDeployment({
      origin: process.env.MONITOR_ORIGIN,
      statusDir,
      dataDir: process.env.MONITOR_DATA_DIR || '/data',
    });
    const alert = await deliverAlert(report, {
      webhook: process.env.MONITOR_WEBHOOK_URL,
      statusDir,
    });
    console.log(JSON.stringify({ ...report, alert }));
    if (!report.healthy || alert === 'not_configured') process.exitCode = 1;
  } catch {
    console.error(
      'Monitoring failed: check configuration, state mounts, HTTPS connectivity and alert delivery.',
    );
    process.exitCode = 1;
  }
}
