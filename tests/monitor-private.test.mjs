import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectDeployment, deliverAlert } from '../scripts/monitor-private.mjs';

test('monitor detects HTTPS, missing and old backups; notifications deduplicate and recover without exposing evidence', async () => {
  await mkdir('.tools/monitor-tests', { recursive: true });
  const folder = await mkdtemp(path.resolve('.tools/monitor-tests/run-'));
  const now = Date.now();
  const ready = async () => Response.json({ service: 'preuvix', status: 'ready' });
  const options = {
    origin: 'https://example.test',
    statusDir: folder,
    dataDir: folder,
    now,
    request: ready,
  };
  const missing = await inspectDeployment(options);
  assert.ok(missing.issues.includes('backup_not_verified'));
  assert.ok(missing.issues.includes('restore_not_verified'));
  for (const name of ['backup', 'restore'])
    await writeFile(
      path.join(folder, `${name}-success.json`),
      JSON.stringify({ completedAt: new Date(now).toISOString() }),
    );
  const good = await inspectDeployment(options);
  assert.ok(!good.issues.some((issue) => /backup|restore|service/.test(issue)));
  const old = await inspectDeployment({ ...options, now: now + 40 * 86400000 });
  assert.ok(old.issues.includes('backup_overdue'));
  assert.ok(old.issues.includes('restore_overdue'));
  const down = await inspectDeployment({
    ...options,
    request: async () => {
      throw new Error('TLS failed');
    },
  });
  assert.ok(down.issues.includes('https_or_service_unavailable'));
  await assert.rejects(inspectDeployment({ ...options, origin: 'http://example.test' }), /HTTPS/);
  const messages = [];
  const notifications = {
    webhook: 'https://alerts.example.test/secret',
    statusDir: folder,
    request: async (_url, init) => {
      messages.push(JSON.parse(init.body));
      return new Response('', { status: 200 });
    },
  };
  const failed = { ...down, healthy: false };
  assert.equal(await deliverAlert(failed, notifications), 'sent');
  assert.equal(await deliverAlert(failed, notifications), 'unchanged');
  assert.equal(
    await deliverAlert(
      { checkedAt: new Date(now + 1000).toISOString(), healthy: true, issues: [] },
      notifications,
    ),
    'sent',
  );
  assert.equal(messages.length, 2);
  assert.ok(!JSON.stringify(messages).includes('secret'));
  assert.equal(await deliverAlert(good, { statusDir: folder }), 'not_configured');
});
