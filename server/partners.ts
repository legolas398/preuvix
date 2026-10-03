import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { partnerCatalogSchema, type Partner } from '../shared/partners';

export async function readPartners(dataDir: string): Promise<Partner[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(dataDir, 'partners.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return partnerCatalogSchema
    .parse(JSON.parse(raw))
    .filter((row) => row.published && row.partnershipConfirmed)
    .map(({ published, partnershipConfirmed, ...partner }) => partner);
}
