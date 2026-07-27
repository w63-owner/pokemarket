import { NextResponse } from "next/server";

export function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("target");
  if (target !== "return" && target !== "refresh") {
    return NextResponse.json({ error: "Cible invalide" }, { status: 400 });
  }

  return NextResponse.redirect(`pokemarket://wallet/${target}`);
}
