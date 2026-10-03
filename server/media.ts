import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { inspectImage } from './integrity';
import { photoFormat } from '../shared/photo-format';
import { inspectVideoMetadata } from './provenance';
const require = createRequire(import.meta.url);
const probe = require('ffprobe-static').path as string;
const ffmpeg = require('ffmpeg-static') as string;
const exec = promisify(execFile);

export async function inspectMedia(bytes: Buffer) {
  if (photoFormat(bytes.subarray(0, 256))) {
    if (bytes.length > 10 * 1024 * 1024) throw new Error('La photo dépasse la limite de 10 Mo.');
    return inspectImage(bytes);
  }
  const webm = bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const mp4 = bytes.subarray(4, 8).toString() === 'ftyp';
  if (
    webm &&
    !bytes.subarray(0, 256).includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]))
  )
    throw new Error('Le conteneur EBML doit déclarer un document WebM.');
  if (!webm && !mp4) throw new Error('Format invalide. JPEG, PNG, WebP, MP4 ou WebM requis.');
  const directory = await mkdtemp(path.join(tmpdir(), 'preuvix-media-'));
  try {
    const file = path.join(directory, webm ? 'original.webm' : 'original.mp4');
    await writeFile(file, bytes);
    const { stdout } = await exec(
      probe,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov,matroska,webm',
        '-show_entries',
        'stream=codec_type,codec_name,width,height,duration:stream_tags:format=duration:format_tags:packet=pts_time,duration_time',
        '-of',
        'json',
        file,
      ],
      { timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    );
    const info = JSON.parse(stdout);
    const videos =
      info.streams?.filter((s: { codec_type: string }) => s.codec_type === 'video') || [];
    if (videos.length !== 1) throw new Error();
    const stream = videos[0];
    if (
      !['h264', 'hevc', 'vp8', 'vp9', 'av1'].includes(stream.codec_name) ||
      !(stream.width > 0 && stream.height > 0) ||
      stream.width * stream.height > 3840 * 2160
    )
      throw new Error();
    const packets = info.packets || [];
    let duration = Number(info.format?.duration || stream.duration);
    if (!Number.isFinite(duration)) {
      const times = packets
        .map((p: { pts_time?: string; duration_time?: string }) => ({
          start: Number(p.pts_time),
          duration: Number(p.duration_time || 0),
        }))
        .filter((p: { start: number }) => Number.isFinite(p.start));
      duration = times.length
        ? Math.max(...times.map((p: { start: number; duration: number }) => p.start + p.duration)) -
          Math.min(...times.map((p: { start: number }) => p.start))
        : 0;
    }
    if (!packets.length || !(duration > 0 && duration <= 120)) throw new Error();
    // Decode the accepted streams without rewriting the original. No network protocols allowed.
    await exec(
      ffmpeg,
      [
        '-v',
        'error',
        '-xerror',
        '-nostdin',
        '-threads',
        '1',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov,matroska,webm',
        '-i',
        file,
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-t',
        '121',
        '-threads',
        '1',
        '-f',
        'null',
        '-',
      ],
      { timeout: 45000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const provenance = inspectVideoMetadata({
      container: info.format?.tags,
      streams: info.streams?.map((item: { tags?: unknown }) => item.tags),
    });
    return {
      mime: webm ? 'video/webm' : 'video/mp4',
      width: stream.width as number,
      height: stream.height as number,
      durationSeconds: duration,
      provenance,
    };
  } catch {
    throw new Error(
      'Vidéo non validée : MP4 ou WebM lisible, 120 secondes et 3840 × 2160 maximum. Un décodage incomplet ou trop lent est refusé.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
