import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushNotification } from "@/lib/push/send";
import type { PushNotificationRequest } from "@/types/api";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: PushNotificationRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  if (!body.user_id || !body.title || !body.body) {
    return NextResponse.json(
      { error: "user_id, title et body sont requis" },
      { status: 400 },
    );
  }

  await sendPushNotification(body.user_id, body.title, body.body, body.url);

  return NextResponse.json({ ok: true });
}
