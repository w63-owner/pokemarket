import type { OcrResponse } from "@pokemarket/shared";
import { api } from "./client";
import { env } from "@/lib/env";

/**
 * Run the AI scan on an already-uploaded card image.
 *
 * The image MUST live on the configured Supabase Storage bucket and be a
 * public HTTPS URL — the backend rejects everything else.
 *
 * We also enforce the origin client-side so a compromised mobile build (or
 * a stolen anon key proxied through this endpoint) can't be used to send
 * arbitrary URLs to the OCR endpoint and burn through our OpenAI quota.
 * The backend remains the source of truth; this is a defense-in-depth guard.
 */
export async function runOcrScan(imageUrl: string): Promise<OcrResponse> {
  if (!imageUrl.startsWith(env.SUPABASE_URL)) {
    throw new Error(
      "Invalid image URL: OCR only accepts images hosted on Supabase Storage.",
    );
  }
  return api.post<OcrResponse>("/api/ocr", { image_url: imageUrl });
}
