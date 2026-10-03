import { Reader, Context } from '@contentauth/c2pa-node';
import type { ContentCredentials } from '../shared/types';

// IPTC digital source types that declare synthetic or AI-generated content.
const SYNTHETIC_SOURCES = [
  'trainedAlgorithmicMedia',
  'compositeWithTrainedAlgorithmicMedia',
  'algorithmicMedia',
  'compositeSynthetic',
];
const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
const UNTRUSTED = 'signingCredential.untrusted';

type Status = { code?: string | null };

/**
 * Validates embedded C2PA Content Credentials: claim signature, hard bindings to the
 * exact bytes and, when anchors are configured, the signer certificate chain.
 * Remote manifests and OCSP are never fetched: validation uses only the deposited bytes.
 */
export async function validateContentCredentials(
  bytes: Buffer,
  mime: string,
  trustAnchors: string,
): Promise<ContentCredentials> {
  const empty: ContentCredentials = {
    state: 'absent',
    signer: null,
    claimGenerator: null,
    digitalSourceTypes: [],
    aiDeclared: false,
    failures: [],
  };
  if (!SUPPORTED.includes(mime)) return { ...empty, state: 'unsupported' };
  let store;
  try {
    const context = new Context({
      verify: {
        verifyAfterReading: true,
        verifyTrust: Boolean(trustAnchors),
        remoteManifestFetch: false,
        ocspFetch: false,
      },
      ...(trustAnchors ? { trust: { trustAnchors } } : {}),
    });
    const reader = await Reader.fromAsset({ buffer: bytes, mimeType: mime }, context);
    if (!reader) return empty;
    store = reader.json();
  } catch (error) {
    // A manifest that cannot be parsed or whose bindings break is treated as tampered.
    return { ...empty, state: 'invalid', failures: [(error as Error).name || 'read_error'] };
  }
  const active = store.active_manifest ? store.manifests?.[store.active_manifest] : undefined;
  if (!active) return empty;
  const statuses: Status[] = [
    ...((store.validation_results?.activeManifest?.failure as Status[] | undefined) ?? []),
    ...((store.validation_status as Status[] | null | undefined) ?? []),
  ];
  const failures = [...new Set(statuses.map((s) => s.code).filter((c): c is string => !!c))];
  const serious = failures.filter((code) => code !== UNTRUSTED);
  // An untrusted signer alone is not tampering: the signature and bindings still hold.
  const invalid =
    serious.length > 0 || (store.validation_state === 'Invalid' && !failures.includes(UNTRUSTED));
  const state: ContentCredentials['state'] = invalid
    ? 'invalid'
    : store.validation_state === 'Trusted' && trustAnchors
      ? 'trusted'
      : 'valid_untrusted';
  const text = JSON.stringify(active);
  const digitalSourceTypes = [
    ...new Set([...text.matchAll(/digitalsourcetype\/([A-Za-z]+)/gi)].map((match) => match[1])),
  ];
  const signature = active.signature_info;
  const generator =
    active.claim_generator_info?.map((info) =>
      [info.name, info.version].filter(Boolean).join(' '),
    )[0] ??
    (active as { claim_generator?: string }).claim_generator ??
    null;
  return {
    state,
    signer: signature
      ? {
          issuer: signature.issuer ?? null,
          commonName: signature.common_name ?? null,
          time: signature.time ?? null,
        }
      : null,
    claimGenerator: generator ? String(generator).slice(0, 200) : null,
    digitalSourceTypes,
    aiDeclared: digitalSourceTypes.some((type) => SYNTHETIC_SOURCES.includes(type)),
    failures: failures.slice(0, 20),
  };
}
