import { z } from 'zod';
import { locationSampleSchema } from './capture';

// Device claims, never a server challenge or a qualified timestamp.
export const mobileEvidenceSchema = z
  .object({
    origin: z.enum(['system_file_picker', 'native_camera']),
    selectedAt: z.iso.datetime(),
    transformation: z.enum(['none_by_preuvix', 'camera_jpeg_processing']),
    location: locationSampleSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.origin === 'native_camera'
        ? value.transformation === 'camera_jpeg_processing'
        : value.transformation === 'none_by_preuvix',
    'Transformation incohérente.',
  );
export type MobileEvidence = z.infer<typeof mobileEvidenceSchema>;
