import type { OcrResponse } from "@pokemarket/shared";
import { api } from "./client";

/**
 * Run the AI scan on an already-uploaded card image.
 *
 * The image MUST live on the configured Supabase Storage bucket and be a
 * public HTTPS URL — the backend rejects everything else.
 */
export async function runOcrScan(imageUrl: string): Promise<OcrResponse> {
  return api.post<OcrResponse>("/api/ocr", { image_url: imageUrl });
}
