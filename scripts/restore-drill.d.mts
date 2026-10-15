export function restoreDrill(
  downloaded: string,
  destination: string,
): Promise<{
  restored: boolean;
  proofs: number;
  signaturesVerified: number;
  sessionsRevoked: boolean;
}>;
