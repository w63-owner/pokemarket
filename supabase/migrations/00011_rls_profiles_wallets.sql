ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

-- Profiles: public read (needed for seller blocks, etc.)
CREATE POLICY "profiles_select_public" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id);

-- Wallets: owner only
CREATE POLICY "wallets_select_own" ON wallets
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "wallets_update_own" ON wallets
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);
