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
    assert.equal(assessment.checks.find((c) => c.id === 'ai_metadata')?.result, 'review');
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
