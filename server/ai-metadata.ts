import { crc32, inflateSync } from 'node:zlib';

const MAX_TEXT = 256 * 1024;
const MAX_CHUNK = 64 * 1024;

// Read only PNG text chunks, never compressed pixel data. Bound both the number
// of decompressions and their output so untrusted metadata cannot exhaust memory.
export function pngText(bytes: Buffer): string[] {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return [];
  const texts: string[] = [];
  let total = 0;
  let count = 0;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 8 + length;
    if (end + 4 > bytes.length) break;
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, end);
    offset = end + 4;
    if (kind === 'IEND') break;
    if (!['tEXt', 'zTXt', 'iTXt'].includes(kind)) continue;
    if (++count > 32 || total >= MAX_TEXT) break;
    if (length > MAX_CHUNK) continue;
    if (crc32(bytes.subarray(end - length - 4, end)) !== bytes.readUInt32BE(end)) continue;
    const zero = data.indexOf(0);
    if (zero < 1 || zero > 79) continue;
    try {
      let payload = data.subarray(zero + 1);
      if (kind === 'zTXt') {
        if (payload[0] !== 0) continue;
        payload = inflateSync(payload.subarray(1), { maxOutputLength: MAX_CHUNK });
      } else if (kind === 'iTXt') {
        const compressed = payload[0];
        if ((compressed !== 0 && compressed !== 1) || payload[1] !== 0) continue;
        const languageEnd = payload.indexOf(0, 2);
        if (languageEnd < 0) continue;
        const translatedEnd = payload.indexOf(0, languageEnd + 1);
        if (translatedEnd < 0) continue;
        payload = payload.subarray(translatedEnd + 1);
        if (compressed) payload = inflateSync(payload, { maxOutputLength: MAX_CHUNK });
      }
      total += payload.length;
      if (total > MAX_TEXT) break;
      texts.push(
        `${data.toString('latin1', 0, zero)}: ${payload.toString(kind === 'iTXt' ? 'utf8' : 'latin1')}`,
      );
    } catch {
      // Unreadable or oversized metadata is not evidence of AI or authenticity.
    }
  }
  return texts;
}

const TOOLS: [string, RegExp][] = [
  ['Midjourney', /\bmidjourney\b/i],
  ['DALL-E', /\bdall[\s·-]?e\b/i],
  ['Stable Diffusion', /\bstable[ _-]diffusion\b/i],
  ['ComfyUI', /\bcomfyui\b/i],
  ['Adobe Firefly', /\b(?:adobe\s+)?firefly\b/i],
  ['Automatic1111', /\bautomatic1111\b/i],
  ['InvokeAI', /\binvokeai\b/i],
  ['Fooocus', /\bfooocus\b/i],
];

export function aiMetadataSignals(texts: string[]): string[] {
  const text = texts
    .map((value) => value.slice(0, MAX_TEXT))
    .join('\n')
    .slice(0, MAX_TEXT);
  const signals = TOOLS.filter(([, pattern]) => pattern.test(text)).map(
    ([tool]) => `Métadonnée mentionnant ${tool}`,
  );
  if (/\bSteps:\s*\d+/i.test(text) && /\bSampler:/i.test(text) && /\bSeed:\s*\d+/i.test(text))
    signals.push('Paramètres de génération de type Stable Diffusion');
  if (
    /"class_type"\s*:\s*"(?:KSampler(?:Advanced)?|SamplerCustom(?:Advanced)?|CLIPTextEncode)"/.test(
      text,
    )
  )
    signals.push('Workflow de génération de type ComfyUI');
  if (
    /\b(?:trainedAlgorithmicMedia|compositedWithTrainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia)\b/i.test(
      text,
    )
  )
    signals.push('Marqueur déclaratif de génération ou retouche IA');
  return signals;
}
