import { z } from 'zod';

export const PlatformEnum = z.enum(['general', 'adobe', 'shutterstock']);
export const AssetTypeEnum = z.enum(['auto','photo','illustration','vector','3d','icon','video']);

export const FileSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  size: z.number().nonnegative(),
  type: z.string(),
  ext: z.string()
});

export const FormSchema = z.object({
  platform: PlatformEnum,
  model: z.object({ provider: z.enum(['gemini','mistral']), preview: z.boolean().optional() }),
  titleLen: z.number().min(20).max(200),
  descLen: z.literal(150),
  keywordCount: z.number().min(5).max(49),
  assetType: AssetTypeEnum,
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  negativeTitle: z.array(z.string()).optional().default([]),
  negativeKeywords: z.array(z.string()).optional().default([]),
  singleMode: z.boolean().optional().default(false),
  parallelMode: z.boolean().optional().default(false),
  videoHints: z.object({ style: z.array(z.string()).optional(), tech: z.array(z.string()).optional() }).optional(),
  isolatedOnTransparentBackground: z.boolean().optional().default(false),
  isolatedOnWhiteBackground: z.boolean().optional().default(false),
  isVector: z.boolean().optional().default(false),
  isIllustration: z.boolean().optional().default(false)
});

export type FormState = z.infer<typeof FormSchema>;


