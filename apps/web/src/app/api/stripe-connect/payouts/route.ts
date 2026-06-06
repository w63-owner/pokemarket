import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");

    let query = supabase
      .from("payouts")
      .select("*")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (cursor) {
      query = query.lt("requested_at", cursor);
    }

    const { data, error } = await query;

    if (error) {
      Sentry.captureException(error);
      return NextResponse.json(
        { error: "Erreur lors de la récupération de l'historique" },
        { status: 500 },
      );
    }

    const hasMore = data.length > PAGE_SIZE;
    const payouts = hasMore ? data.slice(0, PAGE_SIZE) : data;
    const nextCursor = hasMore
      ? payouts[payouts.length - 1]?.requested_at
      : null;

    return NextResponse.json({
      payouts,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue" },
      { status: 500 },
    );
  }
}
