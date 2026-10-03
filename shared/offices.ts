import { z } from 'zod';
export const officeCatalogSchema = z.object({
  source: z.literal('https://annuaire.commissaire-justice.fr/'),
  retrievedAt: z.string(),
  offices: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        postalCode: z.string(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        directoryUrl: z
          .string()
          .url()
          .refine((url) => new URL(url).origin === 'https://annuaire.commissaire-justice.fr'),
      }),
    )
    .max(10000),
});
export type Office = z.infer<typeof officeCatalogSchema>['offices'][number];
