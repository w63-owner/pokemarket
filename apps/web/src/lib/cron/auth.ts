/**
 * Fail-closed authorization for `/api/cron/*` routes.
 *
 * A missing/empty `CRON_SECRET` must never authenticate as
 * `Authorization: Bearer undefined` / `Bearer `.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  return (
    typeof secret === "string" &&
    secret.length > 0 &&
    auth === `Bearer ${secret}`
  );
}
