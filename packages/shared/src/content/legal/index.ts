import type { LegalDocument } from "./types";
import { cgvFr } from "./cgv.fr";
import { cguFr } from "./cgu.fr";
import { privacyFr } from "./privacy.fr";
import { mentionsFr } from "./mentions.fr";

export type { LegalDocument, LegalSection, LegalBlock } from "./types";

export type LegalSlug = LegalDocument["slug"];

const documentsFr: Record<LegalSlug, LegalDocument> = {
  cgv: cgvFr,
  cgu: cguFr,
  privacy: privacyFr,
  mentions: mentionsFr,
};

/**
 * Look up a legal document by slug + locale. Currently only French is
 * shipped; falls back to French for any unknown locale so renderers
 * never receive `undefined`.
 */
export function getLegalDocument(
  slug: LegalSlug,
  _locale: "fr" = "fr",
): LegalDocument {
  return documentsFr[slug];
}

export const legalDocumentsFr = documentsFr;
