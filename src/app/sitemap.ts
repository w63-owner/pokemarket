import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pokemarket.fr";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient();

  const [{ data: listings }, { data: profiles }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, updated_at")
      .eq("status", "ACTIVE")
      .order("updated_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("username, updated_at")
      .not("username", "is", null),
  ]);

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
  ];

  const listingPages: MetadataRoute.Sitemap = (listings ?? []).map((l) => ({
    url: `${BASE_URL}/listing/${l.id}`,
    lastModified: new Date(l.updated_at ?? Date.now()),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  const profilePages: MetadataRoute.Sitemap = (profiles ?? []).map((p) => ({
    url: `${BASE_URL}/u/${p.username}`,
    lastModified: new Date(p.updated_at ?? Date.now()),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...listingPages, ...profilePages];
}
