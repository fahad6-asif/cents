import type { MetadataRoute } from "next";

/** A demo with per-visitor seeded data: keep crawlers out (each new visitor seeds a session). */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
