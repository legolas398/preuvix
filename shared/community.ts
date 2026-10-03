import { z } from 'zod';

// Commissaires de justice keep their own directory (partners.json); the community
// catalogue covers the other professions that help people use their evidence.
export const communitySpaces = ['avocats', 'associations', 'experts'] as const;
export type CommunitySpace = (typeof communitySpaces)[number];

const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Une adresse HTTPS publique est requise.');

export const communityMemberSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  space: z.enum(communitySpaces),
  name: z.string().trim().min(2).max(120),
  area: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(600),
  topics: z.array(z.string().trim().min(2).max(40)).max(6).default([]),
  website: httpsUrl,
  // Official registry or federation page that lets visitors check the member independently.
  verificationUrl: httpsUrl.optional(),
});
export type CommunityMember = z.infer<typeof communityMemberSchema>;

export const communityCatalogSchema = z
  .array(
    communityMemberSchema.extend({
      published: z.boolean(),
      partnershipConfirmed: z.boolean(),
    }),
  )
  .max(500)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    'Identifiants dupliqués.',
  );

export const communityResponseSchema = z.object({
  members: z.array(communityMemberSchema),
  contact: z.email().nullable(),
});
