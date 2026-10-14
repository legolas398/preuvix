export type BackupManifest = {
  version: number;
  createdAt: string;
  files: { name: string; sha256: string }[];
};
export function createBackup(
  source: string,
  destination: string,
): Promise<{ files: number; verified: boolean }>;
export function verifyBackup(source: string): Promise<BackupManifest>;
export function restoreBackup(
  source: string,
  destination: string,
): Promise<{ files: number; verified: boolean; sessionsRevoked: boolean }>;
