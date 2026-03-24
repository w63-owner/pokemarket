import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushNotification } from "@/lib/push/send";
import { pushRateLimit, applyRateLimit } from "@/lib/rate-limit";
import type { PushNotificationRequest } from "@/types/api";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const rateLimitResponse = await applyRateLimit(pushRateLimit, user.id);
  if (rateLimitResponse) return rateLimitResponse;

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

  if (body.user_id === user.id) {
    return NextResponse.json(
      { error: "Impossible d'envoyer une notification à soi-même" },
      { status: 400 },
    );
  }

  const callerId = user.id;
  const targetId = body.user_id;

  const [conversationResult, transactionResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("id")
      .or(
        `and(buyer_id.eq.${callerId},seller_id.eq.${targetId}),and(buyer_id.eq.${targetId},seller_id.eq.${callerId})`,
      )
      .limit(1),
    supabase
      .from("transactions")
      .select("id")
      .or(
        `and(buyer_id.eq.${callerId},seller_id.eq.${targetId}),and(buyer_id.eq.${targetId},seller_id.eq.${callerId})`,
      )
      .in("status", ["PENDING_PAYMENT", "PAID", "SHIPPED", "DISPUTED"])
      .limit(1),
  ]);

  const hasRelation =
    (conversationResult.data?.length ?? 0) > 0 ||
    (transactionResult.data?.length ?? 0) > 0;

  if (!hasRelation) {
    return NextResponse.json(
      { error: "Tentative d'envoi non autorisée" },
      { status: 403 },
    );
  }

  await sendPushNotification(body.user_id, body.title, body.body, body.url);

  return NextResponse.json({ ok: true });
}
