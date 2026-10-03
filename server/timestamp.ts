import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import type { Config } from './config';
import type { TimestampReceipt } from '../shared/types';
import { hash } from './integrity';

const exec = promisify(execFile);
export type TimestampResult = { receipt: TimestampReceipt; query: Buffer; response: Buffer };
export type TimestampService = (manifestHash: string) => Promise<TimestampResult>;

export function timestampService(
  config: Config,
  transport: typeof fetch = fetch,
): TimestampService {
  return async (manifestHash) => {
    if (!config.timestampConfigured) throw new Error('Horodatage non configuré.');
    if (!/^[a-f0-9]{64}$/.test(manifestHash)) throw new Error('Invalid digest');
    const tsa = config.timestamp;
    const directory = await mkdtemp(path.join(tmpdir(), 'preuvix-ts-'));
    const queryPath = path.join(directory, 'request.tsq');
    const responsePath = path.join(directory, 'response.tsr');
    const tokenPath = path.join(directory, 'token.der');
    const signerPath = path.join(directory, 'signer.pem');
    const run = (args: string[]) =>
      exec(tsa.openssl, args, {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, LC_ALL: 'C' },
      });
    try {
      await run([
        'ts',
        '-query',
        '-digest',
        manifestHash,
        '-sha256',
        '-cert',
        '-tspolicy',
        tsa.policyOid,
        '-out',
        queryPath,
      ]);
      const query = await readFile(queryPath);
      const res = await transport(tsa.url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: {
          'Content-Type': 'application/timestamp-query',
          Accept: 'application/timestamp-reply',
          ...(tsa.authorization ? { Authorization: tsa.authorization } : {}),
        },
        body: new Uint8Array(query),
      });
      if (
        !res.ok ||
        !res.headers.get('content-type')?.toLowerCase().startsWith('application/timestamp-reply')
      )
        throw new Error('Invalid TSA response');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Empty TSA response');
      const chunks: Buffer[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw new Error('TSA response too large');
        }
        chunks.push(Buffer.from(value));
      }
      const response = Buffer.concat(chunks);
      await writeFile(responsePath, response);
      // Validates message imprint, nonce, requested policy, timestamp EKU and chain.
      await run([
        'ts',
        '-verify',
        '-queryfile',
        queryPath,
        '-in',
        responsePath,
        '-CAfile',
        tsa.caFile,
      ]);
      await run(['ts', '-reply', '-in', responsePath, '-token_out', '-out', tokenPath]);
      // Chain was checked above. Extract the actual CMS signer, not any embedded certificate.
      await run([
        'cms',
        '-verify',
        '-inform',
        'DER',
        '-in',
        tokenPath,
        '-noverify',
        '-signer',
        signerPath,
        '-out',
        path.join(directory, 'tstinfo.der'),
      ]);
      const signer = new X509Certificate(await readFile(signerPath));
      const signerSha256 = hash(signer.raw);
      if (signerSha256 !== tsa.signerSha256) throw new Error('Unexpected timestamp signer');
      const { stdout } = await run(['ts', '-reply', '-in', responsePath, '-text']);
      const policyOid = stdout.match(/Policy OID:\s*([^\r\n]+)/)?.[1]?.trim();
      const timeText = stdout.match(/Time stamp:\s*([^\r\n]+)/)?.[1]?.trim();
      const time = timeText ? new Date(timeText) : new Date(NaN);
      if (
        policyOid !== tsa.policyOid ||
        !Number.isFinite(time.valueOf()) ||
        Math.abs(Date.now() - time.valueOf()) > 10 * 60 * 1000
      )
        throw new Error('Unexpected timestamp policy or date');
      const reviewed = Boolean(tsa.trustListUrl) && Date.parse(tsa.reviewValidUntil) > Date.now();
      return {
        query,
        response,
        receipt: {
          provider: tsa.name,
          time: time.toISOString(),
          verifiedAt: new Date().toISOString(),
          policyOid,
          signerSha256,
          responseSha256: hash(response),
          qualification: reviewed ? 'operator_reviewed' : 'not_assessed',
          trustListUrl: tsa.trustListUrl || null,
          reviewValidUntil: tsa.reviewValidUntil || null,
        },
      };
    } finally {
      // directory is created by mkdtemp above, never derived from a request.
      await rm(directory, { recursive: true, force: true });
    }
  };
}
