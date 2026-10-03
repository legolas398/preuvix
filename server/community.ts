import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { communityCatalogSchema, type CommunityMember } from '../shared/community';

export async function readCommunity(dataDir: string): Promise<CommunityMember[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(dataDir, 'community.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return communityCatalogSchema
    .parse(JSON.parse(raw))
    .filter((row) => row.published && row.partnershipConfirmed)
    .map(({ published, partnershipConfirmed, ...member }) => member);
}
