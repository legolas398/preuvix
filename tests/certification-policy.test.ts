import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessCertification } from '../shared/certification-policy';
import { inspectVideoMetadata } from '../server/provenance';
import type { Manifest } from '../shared/types';

test('AI metadata and unvalidated credentials require review even for committed capture', () => {
  for (const tags of [
    { encoder: 'Sora' },
    { comment: 'trainedAlgorithmicMedia' },
    { comment: 'c2pa' },
  ]) {
    const provenance = inspectVideoMetadata(tags);
    const assessment = assessCertification({ provenance, capture: { id: 'session' } } as Manifest);
    assert.equal(assessment.status, 'review_required');
    assert.equal(assessment.aiAuthenticity, 'not_established');
    // Metadata hints are flagged by ai_metadata; a bare C2PA marker by the c2pa check.
    assert.ok(
      assessment.checks.some(
        (c) => ['ai_metadata', 'c2pa'].includes(c.id) && c.result === 'review',
      ),
    );
  }
});

test('stripped or ordinary metadata never establishes absence of AI', () => {
  for (const tags of [undefined, {}, { encoder: 'Lavf' }]) {
    const provenance = inspectVideoMetadata(tags);
    assert.equal(provenance.result, 'inconclusive');
    const assessment = assessCertification({ provenance } as Manifest);
    assert.equal(assessment.status, 'integrity_only');
    assert.equal(assessment.aiAuthenticity, 'not_established');
  }
});

test('a live challenge only counts when committed within its time limit', () => {
  const provenance = inspectVideoMetadata({});
  const challenge = { code: 'K7Q2', gesture: 'Montrez le poing fermé', maxSeconds: 180 };
  const fresh = assessCertification({
    provenance,
    capture: { id: 's', challenge, elapsedSeconds: 40 },
  } as Manifest);
  assert.equal(fresh.status, 'capture_challenged');
  assert.equal(fresh.aiAuthenticity, 'not_established');
  const late = assessCertification({
    provenance,
    capture: { id: 's', challenge, elapsedSeconds: 400 },
  } as Manifest);
  assert.equal(late.status, 'capture_documented');
});
