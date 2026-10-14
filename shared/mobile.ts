import { z } from 'zod';
import { locationSampleSchema } from './capture';

// Device claims, never a server challenge or a qualified timestamp.
export const mobileEvidenceSchema = z
  .object({
    origin: z.enum(['system_file_picker', 'native_camera', 'in_app_camera']),
    selectedAt: z.iso.datetime(),
    transformation: z.enum(['none_by_preuvix', 'camera_jpeg_processing', 'camera_video_encoding']),
    location: locationSampleSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.origin !== 'system_file_picker'
        ? value.transformation === 'camera_jpeg_processing' ||
          (value.origin === 'in_app_camera' && value.transformation === 'camera_video_encoding')
        : value.transformation === 'none_by_preuvix',
    'Transformation incohérente.',
  );
export type MobileEvidence = z.infer<typeof mobileEvidenceSchema>;
