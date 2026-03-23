import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pokemarket.fr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/profile/",
        "/messages/",
        "/checkout/",
        "/orders/",
        "/wallet/",
        "/sell",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
