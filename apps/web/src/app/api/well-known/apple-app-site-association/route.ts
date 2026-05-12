import { NextResponse } from "next/server";

export const runtime = "edge";
// Apple fetches this file at most once per day; longer cache is fine.
export const revalidate = 3600;

const APP_BUNDLE_ID =
  process.env.IOS_APP_BUNDLE_ID ?? "app.pokemarket.mobile";
// Apple Developer Team ID (10-char alphanumeric). Must be set in env in
// production. Fall back to a placeholder so build/dev never crashes — when
// the real Team ID is missing the file simply won't validate Apple-side,
// but `/.well-known/...` keeps responding with 200.
const APP_TEAM_ID = process.env.IOS_APP_TEAM_ID ?? "TEAMID0000";

const APP_ID = `${APP_TEAM_ID}.${APP_BUNDLE_ID}`;

const payload = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: [APP_ID],
        components: [
          // Open the mobile app for these paths; everything else falls back
          // to the web. The exclude lists block paths that have to stay on
          // the web (auth flows, payment redirects, admin).
          { "/": "/listing/*", comment: "Open product detail" },
          { "/": "/u/*", comment: "Open public profile" },
          { "/": "/messages/*", comment: "Open conversation" },
          { "/": "/orders/*", comment: "Open order" },
          { "/": "/wallet/*", comment: "Open wallet" },
          { "/": "/checkout/*", comment: "Open checkout" },
          {
            "/": "/auth/*",
            exclude: true,
            comment: "Keep auth flows on web (cookies)",
          },
          {
            "/": "/admin/*",
            exclude: true,
            comment: "Admin only on web",
          },
        ],
      },
    ],
  },
};

export async function GET() {
  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
