import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pokemarket.fr";
const URLS_PER_SITEMAP = 5000;

export async function generateSitemaps() {
  try {
    const supabase = createAdminClient();

    const { count } = await supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE");

    const totalListings = count ?? 0;
    const numChunks = Math.max(1, Math.ceil(totalListings / URLS_PER_SITEMAP));

    return Array.from({ length: numChunks }, (_, i) => ({ id: i }));
  } catch {
    // Supabase unreachable (e.g. CI build with placeholder env vars).
    // Return a single empty sitemap so the build can complete.
    return [{ id: 0 }];
  }
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  let supabase: ReturnType<typeof createAdminClient> | null = null;
  try {
    supabase = createAdminClient();
  } catch {
    // Supabase env missing (CI build) — fall back to static pages only.
  }

  const start = id * URLS_PER_SITEMAP;
  const end = start + URLS_PER_SITEMAP - 1;

  const { data: listings } = supabase
    ? await supabase
        .from("listings")
        .select("id, updated_at")
        .eq("status", "ACTIVE")
        .order("updated_at", { ascending: false })
        .range(start, end)
    : { data: null };

  const listingPages: MetadataRoute.Sitemap = (listings ?? []).map((l) => ({
    url: `${BASE_URL}/listing/${l.id}`,
    lastModified: new Date(l.updated_at ?? Date.now()),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  if (id !== 0) {
    return listingPages;
  }

  const { data: profiles } = supabase
    ? await supabase
        .from("profiles")
        .select("username, updated_at")
        .not("username", "is", null)
    : { data: null };

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/search`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/price-checking`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/legal/cgv`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/cgu`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/mentions`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  const profilePages: MetadataRoute.Sitemap = (profiles ?? []).map((p) => ({
    url: `${BASE_URL}/u/${p.username}`,
    lastModified: new Date(p.updated_at ?? Date.now()),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...listingPages, ...profilePages];
}
