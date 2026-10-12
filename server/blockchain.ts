import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { boundedBody } from './evidence-services';
import { hash } from './integrity';

// Use the standard OTS codec; network access stays bounded and allowlisted here.
const require = createRequire(import.meta.url);
const ots = {
  DetachedTimestampFile: require('opentimestamps/src/detached-timestamp-file.js'),
  Ops: require('opentimestamps/src/ops.js'),
  Timestamp: require('opentimestamps/src/timestamp.js'),
  Context: require('opentimestamps/src/context.js'),
  Notary: require('opentimestamps/src/notary.js'),
};
export const OTS_PROVIDER_KEY = hash('OpenTimestamps/Bitcoin/v1');
export const CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
] as const;
const EXPLORERS = ['https://blockstream.info/api', 'https://mempool.space/api'];
export type BitcoinVerification = {
  proof: Buffer;
  state: 'pending' | 'confirmed';
  blockHeight?: number;
  blockHash?: string;
  confirmations?: number;
  confirmedAt?: string;
  verifiedAt: string;
};

export function blockchain(transport: typeof fetch = fetch) {
  async function get(url: string, body?: Buffer) {
    const response = await transport(url, {
      method: body ? 'POST' : 'GET',
      body: body ? new Uint8Array(body) : undefined,
      headers: body
        ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/vnd.opentimestamps.v1',
          }
        : {},
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Service Bitcoin indisponible. Réessayez plus tard.');
    return boundedBody(response, 64 * 1024);
  }
  function decode(bytes: Buffer, digest: string) {
    if (bytes.length > 256 * 1024 || !/^[a-f0-9]{64}$/.test(digest))
      throw new Error('Preuve OTS invalide.');
    const detached = ots.DetachedTimestampFile.deserialize(bytes);
    if (
      !(detached.fileHashOp instanceof ots.Ops.OpSHA256) ||
      Buffer.from(detached.fileDigest()).toString('hex') !== digest
    )
      throw new Error('La preuve blockchain ne correspond pas au manifeste.');
    return detached;
  }
  function entries(timestamp: any): { node: any; attestation: any }[] {
    const result: { node: any; attestation: any }[] = [];
    const stack = [timestamp];
    let count = 0;
    while (stack.length) {
      if (++count > 1024) throw new Error('Preuve OTS trop complexe.');
      const node = stack.pop();
      for (const attestation of node.attestations) result.push({ node, attestation });
      stack.push(...node.ops.values());
    }
    return result;
  }
  async function stamp(digest: string): Promise<Buffer> {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Empreinte invalide.');
    const detached = ots.DetachedTimestampFile.fromHash(new ots.Ops.OpSHA256(), [
      ...Buffer.from(digest, 'hex'),
    ]);
    const tip = detached.timestamp
      .add(new ots.Ops.OpAppend([...randomBytes(16)]))
      .add(new ots.Ops.OpSHA256());
    const results = await Promise.allSettled(
      CALENDARS.map(async (url) => {
        const bytes = await get(`${url}/digest`, Buffer.from(tip.msg));
        const result = ots.Timestamp.deserialize(
          new ots.Context.StreamDeserialization(bytes),
          tip.msg,
        );
        if (
          !entries(result).some(
            ({ attestation }) =>
              attestation instanceof ots.Notary.PendingAttestation &&
              CALENDARS.includes(attestation.uri),
          )
        )
          throw new Error('Accusé de réception du calendrier manquant.');
        return result;
      }),
    );
    let accepted = 0;
    for (const result of results)
      if (result.status === 'fulfilled') {
        tip.merge(result.value);
        accepted++;
      }
    if (!accepted) throw new Error('Calendriers OpenTimestamps indisponibles. Réessayez.');
    return Buffer.from(detached.serializeToBytes());
  }
  async function verify(proof: Buffer, digest: string): Promise<BitcoinVerification> {
    const detached = decode(proof, digest);
    const pending = entries(detached.timestamp).filter(
      ({ attestation }) =>
        attestation instanceof ots.Notary.PendingAttestation && CALENDARS.includes(attestation.uri),
    );
    // Never follow a URI supplied by a proof outside the configured public calendars.
    for (const { node, attestation } of pending.slice(0, 8)) {
      try {
        const bytes = await get(
          `${attestation.uri}/timestamp/${Buffer.from(node.msg).toString('hex')}`,
        );
        node.merge(
          ots.Timestamp.deserialize(new ots.Context.StreamDeserialization(bytes), node.msg),
        );
      } catch {
        /* Pending calendars can return 404 until aggregation completes. */
      }
    }
    const upgraded = Buffer.from(detached.serializeToBytes());
    const candidates = entries(detached.timestamp).filter(
      ({ attestation }) => attestation instanceof ots.Notary.BitcoinBlockHeaderAttestation,
    );
    if (!candidates.length)
      return { proof: upgraded, state: 'pending', verifiedAt: new Date().toISOString() };
    for (const { node, attestation } of candidates.slice(0, 8)) {
      const height = attestation.height;
      if (!Number.isSafeInteger(height) || height < 1) throw new Error('Hauteur Bitcoin invalide.');
      const blocks = await Promise.all(
        EXPLORERS.map(async (base) => {
          const blockHash = (await get(`${base}/block-height/${height}`)).toString().trim();
          if (!/^[a-f0-9]{64}$/.test(blockHash)) throw new Error('Bloc Bitcoin invalide.');
          const header = (await get(`${base}/block/${blockHash}/header`)).toString().trim();
          if (!/^[a-f0-9]{160}$/.test(header)) throw new Error('En-tête Bitcoin invalide.');
          const bytes = Buffer.from(header, 'hex');
          const calculated = Buffer.from(hash(Buffer.from(hash(bytes), 'hex')), 'hex')
            .reverse()
            .toString('hex');
          if (calculated !== blockHash || !bytes.subarray(36, 68).equals(Buffer.from(node.msg)))
            throw new Error('La preuve ne correspond pas à la racine de Merkle Bitcoin.');
          const tip = Number((await get(`${base}/blocks/tip/height`)).toString().trim());
          if (!Number.isSafeInteger(tip) || tip < height)
            throw new Error('Chaîne Bitcoin incohérente.');
          return { blockHash, time: bytes.readUInt32LE(68), confirmations: tip - height + 1 };
        }),
      );
      if (blocks[0].blockHash !== blocks[1].blockHash)
        throw new Error('Les explorateurs Bitcoin divergent.');
      const confirmations = Math.min(...blocks.map((block) => block.confirmations));
      return {
        proof: upgraded,
        state: confirmations >= 6 ? 'confirmed' : 'pending',
        blockHeight: height,
        blockHash: blocks[0].blockHash,
        confirmations,
        confirmedAt: new Date(blocks[0].time * 1000).toISOString(),
        verifiedAt: new Date().toISOString(),
      };
    }
    throw new Error('Preuve Bitcoin non vérifiable.');
  }
  return { stamp, verify, validate: decode };
}
