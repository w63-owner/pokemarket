import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ocrRequestSchema, ocrParsedSchema } from "@/lib/validations";
import type { OcrCandidate, OcrParsed, OcrResponse } from "@/types/api";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
}

const SYSTEM_PROMPT = `You are a Pokemon TCG card analyzer. Analyze the provided image and extract ONLY these 3 fields.

Return STRICTLY a JSON object with these keys:
- "name": The Pokemon name shown on the card (string or null if unreadable)
- "card_number": The collector number printed at the bottom of the card, e.g. "004/102", "25/165", "31/40" (string or null)
- "language": The language of the card text: "fr", "en", "ja", "de", "it", "es", "pt", "ko", "zh-tw", or "zh-cn" (string or null)

If you cannot read a field, set it to null. Do NOT guess.`;

const MAX_CANDIDATES = 5;

function buildTcgdexImageUrl(
  cardId: string,
  setId: string | null,
  seriesId: string | null,
  language: string,
): string | null {
  if (!setId || !seriesId) return null;
  const localId = cardId.startsWith(setId + "-")
    ? cardId.slice(setId.length + 1)
    : cardId.split("-").pop();
  return `https://assets.tcgdex.net/${language}/${seriesId}/${setId}/${localId}/low.webp`;
}

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function computeConfidence(
  parsed: OcrParsed,
  card: {
    name: string | null;
    id: string;
    local_id: string | null;
  },
  setOfficialCount: number | null,
): number {
  let score = 0;
  let weights = 0;

  if (parsed.name && card.name) {
    weights += 50;
    const pName = normalizeStr(parsed.name);
    const cName = normalizeStr(card.name);
    if (pName === cName) {
      score += 50;
    } else if (cName.includes(pName) || pName.includes(cName)) {
      score += 30;
    }
  }

  if (parsed.card_number) {
    const [rawLocalId, rawCount] = parsed.card_number.split("/");
    const ocrLocalId = rawLocalId?.replace(/^0+/, "");
    const ocrCount = rawCount?.replace(/^0+/, "");

    if (ocrLocalId && card.local_id) {
      weights += 30;
      const dbLocalId = card.local_id.replace(/^0+/, "");
      if (ocrLocalId === dbLocalId) {
        score += 30;
      }
    }

    if (ocrCount && setOfficialCount) {
      weights += 20;
      if (ocrCount === String(setOfficialCount)) {
        score += 20;
      }
    }
  }

  if (weights === 0) return 0;
  return Math.round((score / weights) * 100);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentification requise. Veuillez vous connecter." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const validation = ocrRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "URL d'image invalide", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { image_url } = validation.data;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || !image_url.startsWith(supabaseUrl)) {
      return NextResponse.json(
        {
          error:
            "URL d'image non autorisée. Seules les images hébergées sur notre plateforme sont acceptées.",
        },
        { status: 400 },
      );
    }

    let ocrResult: OcrParsed;
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 200,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: image_url, detail: "high" },
              },
              {
                type: "text",
                text: "Analyze this Pokemon card and extract the information as specified.",
              },
            ],
          },
        ],
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return NextResponse.json(
          { error: "L'IA n'a pas pu analyser l'image. Veuillez réessayer." },
          { status: 422 },
        );
      }

      const rawJson = JSON.parse(rawContent);
      const parsed = ocrParsedSchema.safeParse(rawJson);

      if (!parsed.success) {
        return NextResponse.json(
          {
            error:
              "Réponse OCR invalide. Veuillez réessayer avec une image plus nette.",
          },
          { status: 422 },
        );
      }

      ocrResult = parsed.data;
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        if (err.status === 429) {
          return NextResponse.json(
            {
              error: "Trop de requêtes. Veuillez patienter quelques secondes.",
            },
            { status: 429 },
          );
        }
        if (err.status === 400) {
          return NextResponse.json(
            { error: "Image illisible ou format non supporté." },
            { status: 400 },
          );
        }
      }
      console.error("OpenAI OCR error:", err);
      return NextResponse.json(
        { error: "Erreur lors de l'analyse de l'image. Veuillez réessayer." },
        { status: 500 },
      );
    }

    const candidates = await matchTcgdexCards(ocrResult);

    const adminClient = createAdminClient();
    await adminClient.from("ocr_attempts").insert({
      user_id: user.id,
      image_url,
      raw_response: ocrResult as unknown as Record<string, unknown>,
    });

    const response: OcrResponse = {
      parsed: ocrResult,
      candidates,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("OCR route error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue." },
      { status: 500 },
    );
  }
}

async function matchTcgdexCards(parsed: OcrParsed): Promise<OcrCandidate[]> {
  if (!parsed.name) return [];

  const supabase = createAdminClient();
  const language = parsed.language ?? "fr";

  const namePattern = `%${parsed.name}%`;

  let query = supabase
    .from("tcgdex_cards")
    .select(
      "language, id, card_key, name, set_id, hp, rarity, illustrator, local_id",
    )
    .ilike("name", namePattern)
    .limit(20);

  if (parsed.language) {
    query = query.eq("language", language);
  }

  const { data: cards, error } = await query;

  if (error) {
    console.error("TCGdex query error:", error);
    return [];
  }

  if (!cards || cards.length === 0) return [];

  const setIds = [
    ...new Set(cards.map((c) => c.set_id).filter(Boolean)),
  ] as string[];
  const setsMap = new Map<string, string>();
  const seriesIdMap = new Map<string, string>();
  const seriesNameMap = new Map<string, string>();
  const setOfficialCountMap = new Map<string, number>();

  if (setIds.length > 0) {
    const { data: sets } = await supabase
      .from("tcgdex_sets")
      .select("id, name, language, series_id, card_count")
      .in("id", setIds)
      .eq("language", language);

    if (sets) {
      const seriesIds = [
        ...new Set(sets.map((s) => s.series_id).filter(Boolean)),
      ] as string[];

      if (seriesIds.length > 0) {
        const { data: series } = await supabase
          .from("tcgdex_series")
          .select("id, name")
          .in("id", seriesIds)
          .eq("language", language);

        if (series) {
          for (const sr of series) {
            seriesNameMap.set(sr.id, sr.name);
          }
        }
      }

      for (const s of sets) {
        setsMap.set(s.id, s.name);
        if (s.series_id) seriesIdMap.set(s.id, s.series_id);
        const official = (s.card_count as Record<string, number> | null)
          ?.official;
        if (official) setOfficialCountMap.set(s.id, official);
      }
    }
  }

  const scored: OcrCandidate[] = cards.map((card) => {
    const seriesId = card.set_id
      ? (seriesIdMap.get(card.set_id) ?? null)
      : null;
    return {
      card_key: card.card_key,
      card_id: card.id,
      name: card.name ?? "Unknown",
      set_id: card.set_id,
      set_name: card.set_id ? (setsMap.get(card.set_id) ?? null) : null,
      series_name: seriesId ? (seriesNameMap.get(seriesId) ?? null) : null,
      local_id: card.local_id ?? null,
      set_official_count: card.set_id
        ? (setOfficialCountMap.get(card.set_id) ?? null)
        : null,
      hp: card.hp,
      rarity: card.rarity,
      illustrator: card.illustrator ?? null,
      language: card.language,
      image_url: buildTcgdexImageUrl(
        card.id,
        card.set_id,
        seriesId,
        card.language,
      ),
      confidence: computeConfidence(
        parsed,
        card,
        card.set_id ? (setOfficialCountMap.get(card.set_id) ?? null) : null,
      ),
    };
  });

  scored.sort((a, b) => b.confidence - a.confidence);

  return scored.slice(0, MAX_CANDIDATES);
}
