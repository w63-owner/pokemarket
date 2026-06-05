import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Inbox only — conversation threads stay behind AuthGuard. */
function isGuestMessagesInbox(pathname: string) {
  return pathname === "/messages";
}

export async function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isGuestMessagesInbox(pathname)) {
    const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
    redirect(`/auth${next}`);
  }

  return <>{children}</>;
}
