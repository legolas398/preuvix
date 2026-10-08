import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { aiMetadataSignals, pngText } from '../server/ai-metadata';
import { inspectImage } from '../server/integrity';
import { verifyPhoto } from '../server/photo-verification';
import { isSyntheticSource } from '../shared/ai-source';
import { Reader } from '@contentauth/c2pa-node';
import { validateContentCredentials } from '../server/c2pa';

function chunk(kind: string, data: Buffer) {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  output.write(kind, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, -4)), output.length - 4);
  return output;
}
const base = () =>
  sharp({ create: { width: 32, height: 32, channels: 3, background: '#abcdef' } })
    .png()
    .toBuffer();
const withChunk = (png: Buffer, data: Buffer) =>
  Buffer.concat([png.subarray(0, -12), data, png.subarray(-12)]);

test('PNG generation metadata is found in text, compressed text and international text', async () => {
  const png = await base();
  const parameters = 'PRIVATE PROMPT\nSteps: 20, Sampler: Euler, Seed: 1234';
  for (const block of [
    chunk('tEXt', Buffer.from(`parameters\0${parameters}`)),
    chunk('zTXt', Buffer.concat([Buffer.from('parameters\0\0'), deflateSync(parameters)])),
    chunk('iTXt', Buffer.concat([Buffer.from('parameters\0\x01\0\0\0'), deflateSync(parameters)])),
    chunk('iTXt', Buffer.from(`parameters\0\0\0fr\0Paramètres\0${parameters}`)),
  ]) {
    const bytes = withChunk(png, block);
    assert.match(pngText(bytes).join(' '), /Steps: 20/);
    assert.equal((await inspectImage(bytes)).provenance.result, 'signals_found');
    const report = await verifyPhoto(bytes, '', '');
    assert.equal(report.ai.status, 'signals_found');
    assert.match(report.ai.signals.join(' '), /Stable Diffusion/);
    assert.ok(!JSON.stringify(report.ai).includes('PRIVATE PROMPT'));
    assert.match(report.ai.limitation, /Aucun détecteur visuel/);
  }
});

test('stripping metadata is inconclusive; decoded pixels and ordinary software are not an AI verdict', async () => {
  const png = await base();
  const bytes = withChunk(
    png,
    chunk('tEXt', Buffer.from('prompt\0{"1":{"class_type":"KSampler"}}')),
  );
  assert.equal((await verifyPhoto(bytes, '', '')).ai.status, 'signals_found');
  const stripped = await sharp(bytes).png().toBuffer();
  assert.equal((await verifyPhoto(stripped, '', '')).ai.status, 'inconclusive');
  assert.deepEqual(aiMetadataSignals(['Photoshop, camera, seeds, steps, midjourneyish']), []);
});

test('bounded PNG parser ignores oversized, corrupt, truncated and non-text payloads', async () => {
  const png = await base();
  const bomb = chunk(
    'zTXt',
    Buffer.concat([Buffer.from('Software\0\0'), deflateSync('ComfyUI'.repeat(100000))]),
  );
  assert.deepEqual(pngText(withChunk(png, bomb)), []);
  const badCrc = chunk('tEXt', Buffer.from('Software\0ComfyUI'));
  badCrc[badCrc.length - 1] ^= 1;
  assert.deepEqual(pngText(withChunk(png, badCrc)), []);
  assert.deepEqual(pngText(withChunk(png, chunk('IDAT', Buffer.from('ComfyUI')))), []);
  assert.deepEqual(
    pngText(Buffer.concat([png.subarray(0, 8), Buffer.from('ffffffff74455874', 'hex')])),
    [],
  );
});

test('AI editing source uses the registered composited spelling and exact namespace', () => {
  assert.equal(
    isSyntheticSource(
      'http://cv.iptc.org/newscodes/digitalsourcetype/compositedWithTrainedAlgorithmicMedia',
    ),
    true,
  );
  assert.equal(isSyntheticSource('https://example.com/trainedAlgorithmicMedia'), false);
  assert.equal(
    isSyntheticSource('http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture'),
    false,
  );
});

test('C2PA assessment distinguishes signed declarations, broken bindings and incidental text', async (t) => {
  const png = await base();
  const source =
    'http://cv.iptc.org/newscodes/digitalsourcetype/compositedWithTrainedAlgorithmicMedia';
  // Stub SDK validation outcomes to exercise assessment, not cryptography.
  // Real cryptographic validation is covered by photo-verification and c2pa tests.
  let broken = false;
  let declared = true;
  const active = () => ({
    title: source,
    assertions: [
      {
        label: 'c2pa.actions.v2',
        data: { actions: declared ? [{ action: 'c2pa.edited', digitalSourceType: source }] : [] },
      },
    ],
  });
  t.mock.method(Reader, 'fromAsset', async () => ({
    getActive: active,
    json: () => ({
      active_manifest: 'test',
      manifests: { test: active() },
      validation_state: broken ? 'Invalid' : 'Valid',
      validation_results: {
        activeManifest: {
          success: [
            { code: 'claimSignature.validated' },
            ...(!broken ? [{ code: 'assertion.dataHash.match' }] : []),
          ],
          failure: broken ? [{ code: 'assertion.dataHash.mismatch' }] : [],
        },
      },
    }),
  }));
  assert.equal((await verifyPhoto(png, '', '')).ai.status, 'declared_synthetic');
  assert.equal((await validateContentCredentials(png, 'image/png', '')).aiDeclared, true);
  broken = true;
  assert.equal((await verifyPhoto(png, '', '')).ai.status, 'signals_found');
  assert.equal((await validateContentCredentials(png, 'image/png', '')).state, 'invalid');
  broken = false;
  declared = false;
  assert.equal((await verifyPhoto(png, '', '')).ai.status, 'inconclusive');
  assert.equal((await validateContentCredentials(png, 'image/png', '')).aiDeclared, false);
});
