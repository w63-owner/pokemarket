# Feature flags

DeckDealr uses PostHog as a server-side control plane for global capability
switches. Web and mobile read the same `/api/feature-flags` snapshot, so a
switch applies consistently without publishing a new build.

## Initial PostHog setup

1. Create a PostHog Cloud project in the EU region.
2. Add its project key and host to the web deployment:

   ```env
   POSTHOG_PROJECT_KEY=phc_...
   POSTHOG_HOST=https://eu.i.posthog.com
   ```

3. Create these boolean flags in PostHog, enabled for 100% of users:
   - `messaging`
   - `home-search`
   - `selling`
   - `favorites`
   - `checkout`
   - `price-checking`

Turning one off reaches server-rendered routes within about 10 seconds. Open
web and mobile clients refresh their snapshots every 30 seconds, so UI changes
can take up to roughly 40 seconds.

## Adding a capability

1. Add a stable key and its outage default to
   `packages/shared/src/constants/feature-flags.ts`.
2. Create the matching boolean flag in PostHog.
3. Gate navigation and the direct route with the web `ServerFeatureGate` or the
   mobile `FeatureGate`.
4. Gate every server mutation for the capability with `isFeatureEnabled`.

Feature flags are availability controls, not authorization. Supabase RLS,
ownership checks, rate limits, and Stripe launch controls must remain in place.

## Failure behavior

Registered capabilities default to enabled if PostHog is not configured or
temporarily unavailable. A first-time client hides a gated surface only while
its snapshot is loading; a failed client request falls back to the registered
default.
