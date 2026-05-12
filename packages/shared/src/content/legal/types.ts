/**
 * Structured representation of a legal document, designed to be
 * rendered identically on web (HTML) and mobile (React Native).
 *
 * `body` blocks are typed so renderers can choose appropriate
 * components (paragraph, list, table) without parsing markup.
 */

export type LegalParagraph = {
  type: "p";
  text: string;
};

export type LegalList = {
  type: "ul";
  items: string[];
};

export type LegalTable = {
  type: "table";
  headers: string[];
  rows: string[][];
};

export type LegalBlock = LegalParagraph | LegalList | LegalTable;

export type LegalSection = {
  /** Heading depth (2 = h2, 3 = h3). */
  level: 2 | 3;
  heading: string;
  body: LegalBlock[];
};

export type LegalDocument = {
  slug: "cgv" | "cgu" | "privacy" | "mentions";
  title: string;
  lastUpdated: string;
  intro?: LegalBlock[];
  sections: LegalSection[];
};
