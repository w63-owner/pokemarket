import { createBrowserClient, type SupabaseClient } from "@supabase/ssr";

let _client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Add them to your Vercel project environment variables.",
    );
  }

  _client = createBrowserClient(url, key);
  return _client;
}
