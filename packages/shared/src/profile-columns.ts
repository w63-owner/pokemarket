/** Columns anyone may read from `profiles` after column-privilege hardening. */
export const PUBLIC_PROFILE_COLUMNS =
  "id, username, avatar_url, bio, country_code, instagram_url, facebook_url, tiktok_url, created_at, updated_at" as const;

/** Columns returned after a user updates their own profile row. */
export const OWN_PROFILE_UPDATE_RETURNING_COLUMNS =
  "id, username, avatar_url, bio, country_code, instagram_url, facebook_url, tiktok_url, address_line, city, postal_code, created_at, updated_at" as const;
