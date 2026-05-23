import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/api";

const registerSchema = z.object({
  token: z
    .string()
    .min(1)
    .max(256)
    // Expo push tokens follow the pattern `ExponentPushToken[xxx]` or
    // `ExpoPushToken[xxx]`. We keep it permissive to allow future format
    // changes but reject obviously bogus tokens.
    .refine(
      (t) =>
        t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["),
      { message: "Invalid Expo push token" },
    ),
  device_id: z.string().max(128).optional(),
  platform: z.enum(["ios", "android"]),
  app_version: z.string().max(32).optional(),
});

const deleteSchema = z.object({ token: z.string().min(1) });

export async function POST(request: Request) {
  const { user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload invalide" },
      { status: 400 },
    );
  }

  // Use the admin client so we can upsert without re-checking RLS — we've
  // already verified that the user owns the row via `getRequestUser`.
  const admin = createAdminClient();

  const { error } = await admin.from("expo_push_tokens").upsert(
    {
      user_id: user.id,
      token: parsed.data.token,
      device_id: parsed.data.device_id ?? null,
      platform: parsed.data.platform,
      app_version: parsed.data.app_version ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );

  if (error) {
    console.error("[push/expo-tokens] upsert failed:", error);
    return NextResponse.json(
      { error: "Échec de l'enregistrement du token" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Token requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("expo_push_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("token", parsed.data.token);

  if (error) {
    console.error("[push/expo-tokens] delete failed:", error);
    return NextResponse.json(
      { error: "Échec de la suppression du token" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
