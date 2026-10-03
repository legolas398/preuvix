import { z } from 'zod';

export const partnerServices = [
  'Constat immobilier',
  'Constat internet',
  'Travaux et malfaçons',
  'Autre constat matériel',
] as const;
const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Une adresse HTTPS publique est requise.');
export const partnerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  coordinates: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
  departments: z
    .array(z.string().regex(/^(\d{2,3}|2A|2B)$/))
    .min(1)
    .max(110),
  services: z.array(z.enum(partnerServices)).min(1).max(4),
  description: z.string().trim().min(10).max(600),
  website: httpsUrl,
  directoryUrl: httpsUrl.refine(
    (value) => new URL(value).hostname === 'annuaire.commissaire-justice.fr',
    'Lien vers la fiche dans l’annuaire officiel requis.',
  ),
});
export type Partner = z.infer<typeof partnerSchema>;
export const partnerCatalogSchema = z
  .array(
    partnerSchema.extend({
      published: z.boolean(),
      partnershipConfirmed: z.boolean(),
    }),
  )
  .max(500)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    'Identifiants dupliqués.',
  );
