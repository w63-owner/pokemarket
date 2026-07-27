import { createClient } from "@supabase/supabase-js";
import type { Database } from "@pokemarket/shared";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
}

const userId = process.argv[2];
const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.rpc("rebuild_wallet_projections", {
  p_user_id: userId,
});

if (error) throw error;

process.stdout.write(
  `Rebuilt ${data} wallet projection${data === 1 ? "" : "s"}.\n`,
);
