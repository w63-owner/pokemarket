import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

const BASE_URL = getAppUrl();

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
