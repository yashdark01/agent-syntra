import { z } from 'zod';

export const AppConfigSchema = z.object({
  defaultProvider: z.string().min(1, 'defaultProvider is required'),
  defaultModel: z.string().min(1, 'defaultModel is required'),
  streaming: z.boolean().default(true),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().positive().optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const PartialAppConfigSchema = AppConfigSchema.partial();
export type PartialAppConfig = z.infer<typeof PartialAppConfigSchema>;

export const DEFAULT_CONFIG: AppConfig = {
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o',
  streaming: true,
};
