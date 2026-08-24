import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/";
  const confirmationUrl = new URL("/auth/confirmed", origin);
  confirmationUrl.searchParams.set("next", next);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      confirmationUrl.searchParams.set("status", "success");
      return NextResponse.redirect(confirmationUrl);
    }
  }

  confirmationUrl.searchParams.set("status", "error");
  return NextResponse.redirect(confirmationUrl);
}
