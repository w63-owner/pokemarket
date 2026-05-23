import { z } from "zod";

const envSchema = z.object({
  API_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
});

const parsed = envSchema.safeParse({
  API_URL: process.env.EXPO_PUBLIC_API_URL,
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
});

if (!parsed.success) {
  console.error(
    "[env] Missing or invalid Expo public env vars:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error(
    "Invalid mobile env. Copy .env.example to .env and fill required keys.",
  );
}

export const env = parsed.data;
