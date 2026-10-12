import type request from 'supertest';
import { hash } from '../server/integrity';

// Synthetic test media still goes through the real session/commit API.
export async function commitFixture(
  owner: request.Agent,
  origin: string,
  bytes: Buffer,
  kind: 'photo' | 'video' = 'photo',
) {
  const session = (await owner.post('/api/captures').set('Origin', origin).send({}).expect(201))
    .body;
  const at = new Date().toISOString();
  const sample = {
    status: 'recorded',
    latitude: 48.8566,
    longitude: 2.3522,
    accuracy: 12,
    measuredAt: at,
  };
  await owner
    .post(`/api/captures/${session.id}/commit`)
    .set('Origin', origin)
    .send({
      nonce: session.nonce,
      sha256: hash(bytes),
      kind,
      startedAt: at,
      endedAt: at,
      location: { start: sample, ...(kind === 'video' ? { end: sample } : {}) },
    })
    .expect(200);
  return session.id as string;
}
