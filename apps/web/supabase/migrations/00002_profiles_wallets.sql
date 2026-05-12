CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (char_length(username) BETWEEN 3 AND 30),
  avatar_url TEXT,
  country_code CHAR(2) DEFAULT 'FR',
  bio TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  tiktok_url TEXT,
  stripe_account_id TEXT,
  stripe_customer_id TEXT,
  kyc_status TEXT DEFAULT 'UNVERIFIED'
    CHECK (kyc_status IN ('UNVERIFIED','PENDING','REQUIRED','VERIFIED','REJECTED')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE wallets (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  available_balance NUMERIC(10,2) DEFAULT 0 CHECK (available_balance >= 0),
  pending_balance NUMERIC(10,2) DEFAULT 0 CHECK (pending_balance >= 0),
  currency CHAR(3) DEFAULT 'EUR'
);

-- Auto-create profile and wallet on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'username',
      'user_' || substr(NEW.id::text, 1, 8)
    )
  );
  INSERT INTO public.wallets (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
