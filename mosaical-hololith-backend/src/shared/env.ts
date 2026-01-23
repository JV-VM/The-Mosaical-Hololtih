import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  CORS_ORIGIN: z
    .string()
    .default('http://localhost:4200')
    .transform((v) =>
      v.split(',').map((s) => s.trim()).filter(Boolean),
    ),
});

export const env = EnvSchema.parse(process.env);
