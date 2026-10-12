import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { blockchain, CALENDARS } from '../server/blockchain';
import { hash } from '../server/integrity';
const ots = createRequire(import.meta.url)('opentimestamps');

test('OTS stamps only a blinded digest, retains pending receipts, and rejects wrong manifests', async () => {
  const digest = hash('private dossier with location');
  const calls: string[] = [];
  const service = blockchain(async (input, init) => {
    calls.push(String(input));
    if (init?.method !== 'POST') return new Response('', { status: 404 });
    const commitment = Buffer.from(init.body as Uint8Array);
    assert.equal(commitment.length, 32);
    assert.notEqual(commitment.toString('hex'), digest);
    const timestamp = new ots.Timestamp([...commitment]);
    timestamp.attestations.push(new ots.Notary.PendingAttestation(CALENDARS[0]));
    const ctx = new ots.Context.StreamSerialization();
    timestamp.serialize(ctx);
    return new Response(Uint8Array.from(ctx.getOutput()));
  });
  const proof = await service.stamp(digest);
  const checked = await service.verify(proof, digest);
  assert.equal(checked.state, 'pending');
  assert.equal(checked.blockHeight, undefined);
  await assert.rejects(service.verify(proof, hash('changed')), /correspond pas/);
  assert.ok(calls.every((url) => CALENDARS.some((base) => url.startsWith(base + '/'))));
});

test('Bitcoin proof verification checks Merkle root, block header hash, two explorers and confirmations', async () => {
  const digest = hash('dossier');
  const detached = ots.DetachedTimestampFile.fromHash(new ots.Ops.OpSHA256(), [
    ...Buffer.from(digest, 'hex'),
  ]);
  detached.timestamp.attestations.push(new ots.Notary.BitcoinBlockHeaderAttestation(100));
  const proof = Buffer.from(detached.serializeToBytes());
  const header = Buffer.alloc(80);
  Buffer.from(digest, 'hex').copy(header, 36);
  header.writeUInt32LE(1700000000, 68);
  const blockHash = Buffer.from(hash(Buffer.from(hash(header), 'hex')), 'hex')
    .reverse()
    .toString('hex');
  let tip = 105;
  let tamper = false;
  const hosts = new Set<string>();
  const service = blockchain(async (input) => {
    const url = new URL(String(input));
    hosts.add(url.host);
    return new Response(
      url.pathname.endsWith('/header')
        ? tamper
          ? '0'.repeat(160)
          : header.toString('hex')
        : url.pathname.endsWith('/blocks/tip/height')
          ? String(tip)
          : blockHash,
    );
  });
  assert.equal((await service.verify(proof, digest)).state, 'confirmed');
  assert.equal(hosts.size, 2);
  tip = 104;
  assert.equal((await service.verify(proof, digest)).state, 'pending');
  tamper = true;
  await assert.rejects(service.verify(proof, digest), /Merkle/);
});

test('OTS never follows arbitrary calendar URLs and fails closed when stamping fails', async () => {
  const digest = hash('test');
  const detached = ots.DetachedTimestampFile.fromHash(new ots.Ops.OpSHA256(), [
    ...Buffer.from(digest, 'hex'),
  ]);
  detached.timestamp.attestations.push(
    new ots.Notary.PendingAttestation('http://127.0.0.1/secrets'),
  );
  let calls = 0;
  const service = blockchain(async () => {
    calls++;
    throw new Error('offline');
  });
  assert.equal(
    (await service.verify(Buffer.from(detached.serializeToBytes()), digest)).state,
    'pending',
  );
  assert.equal(calls, 0);
  await assert.rejects(service.stamp(digest), /indisponibles/);
});
