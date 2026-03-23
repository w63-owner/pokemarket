import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { ocrRequestSchema, ocrParsedSchema } from "@/lib/validations";
import type { OcrCandidate, OcrParsed, OcrResponse } from "@/types/api";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
}

const SYSTEM_PROMPT = `You are a Pokemon TCG card analyzer. Analyze the provided image of a Pokemon card and extract structured information.

Return STRICTLY a JSON object with these keys:
- "name": The Pokemon name shown on the card (string or null if unreadable)
- "hp": The HP value shown on the card (number or null)
- "set_code": The set code/symbol identifier if visible (string or null)
- "set_name": The full name of the set if recognizable (string or null)
- "card_number": The card number printed on the card, e.g. "004/102" or "25/165" (string or null)
- "language": The language of the card text: "fr" for French, "en" for English, "ja" for Japanese, "de" for German, "it" for Italian, "es" for Spanish, "pt" for Portuguese, "ko" for Korean, "zh-tw" for Traditional Chinese, "zh-cn" for Simplified Chinese (string or null)
- "rarity": The rarity symbol or text if visible: "Common", "Uncommon", "Rare", "Ultra Rare", "Illustration Rare", "Special Art Rare", "Secret Rare", "Amazing Rare", "Radiant Rare" (string or null)

If you cannot read or identify a field, set it to null. Do NOT guess — only return what you can confidently read on the card.`;

const MAX_CANDIDATES = 5;
function buildTcgdexImageUrl(cardId: string, language: string): string {
  return `https://assets.tcgdex.net/${language}/${cardId}/low.webp`;
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
    hp: number | null;
    rarity: string | null;
    id: string;
  },
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
      score += 35;
    }
  }

  if (parsed.card_number) {
    weights += 30;
    const localNum = parsed.card_number.split("/")[0]?.replace(/^0+/, "");
    const cardLocalNum = card.id
      .split("/")
      .pop()
      ?.split("-")
      .pop()
      ?.replace(/^0+/, "");
    if (localNum && cardLocalNum && localNum === cardLocalNum) {
      score += 30;
    }
  }

  if (parsed.hp != null && card.hp != null) {
    weights += 10;
    if (parsed.hp === card.hp) {
      score += 10;
    }
  }

  if (parsed.rarity && card.rarity) {
    weights += 10;
    if (normalizeStr(parsed.rarity) === normalizeStr(card.rarity)) {
      score += 10;
    }
  }

  if (weights === 0) return 0;
  return Math.round((score / weights) * 100);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = ocrRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "URL d'image invalide", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { image_url } = validation.data;

    let ocrResult: OcrParsed;
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 500,
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
    .select("language, id, card_key, name, set_id, hp, rarity")
    .ilike("name", namePattern)
    .limit(30);

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

  if (setIds.length > 0) {
    const { data: sets } = await supabase
      .from("tcgdex_sets")
      .select("id, name, language")
      .in("id", setIds)
      .eq("language", language);

    if (sets) {
      for (const s of sets) {
        setsMap.set(s.id, s.name);
      }
    }
  }

  const scored: OcrCandidate[] = cards.map((card) => ({
    card_key: card.card_key,
    card_id: card.id,
    name: card.name ?? "Unknown",
    set_id: card.set_id,
    set_name: card.set_id ? (setsMap.get(card.set_id) ?? null) : null,
    hp: card.hp,
    rarity: card.rarity,
    language: card.language,
    image_url: buildTcgdexImageUrl(card.id, card.language),
    confidence: computeConfidence(parsed, card),
  }));

  scored.sort((a, b) => b.confidence - a.confidence);

  return scored.slice(0, MAX_CANDIDATES);
}
