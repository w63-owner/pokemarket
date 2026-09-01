import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/00053_harden_profile_and_escrow_rls.sql",
);

describe("security hardening migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("replaces permissive profile update policies with scoped policies", () => {
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Users cannot change their own role" ON public.profiles;',
    );
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;',
    );
    expect(sql).toMatch(
      /CREATE POLICY "profiles_update_own"[\s\S]*?USING \(\(SELECT auth\.uid\(\)\) = id\)[\s\S]*?WITH CHECK \(/,
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.guard_profile_role_update()",
    );
    expect(sql).toContain(
      "'Unauthorized: profile role cannot be changed by this user'",
    );
  });

  it("requires shipped completions to pass through the escrow RPC", () => {
    expect(sql).toContain(
      "current_setting('pokemarket.release_escrow_transaction_id', true)",
    );
    expect(sql).toContain(
      "'Invalid transition: use release_escrow_funds to complete shipped transactions'",
    );
    expect(sql).toMatch(
      /PERFORM set_config\([\s\S]*?'pokemarket\.release_escrow_transaction_id'[\s\S]*?p_transaction_id::TEXT[\s\S]*?true[\s\S]*?\);[\s\S]*?UPDATE public\.transactions[\s\S]*?SET status = 'COMPLETED'/,
    );
  });
});
