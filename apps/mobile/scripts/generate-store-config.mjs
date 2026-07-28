#!/usr/bin/env node
/**
 * Generates apps/mobile/store.config.json from store/ text files.
 * EAS Metadata does not resolve { "$load": "..." } — inline content instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readText(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), "utf8").trim();
}

function readOptional(relativePath, fallbackPath) {
  const primary = path.join(mobileRoot, relativePath);
  if (fs.existsSync(primary)) return fs.readFileSync(primary, "utf8").trim();
  return readText(fallbackPath);
}

function keywordsFromFile(relativePath) {
  return readText(relativePath)
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function reviewNotesFromMarkdown(relativePath) {
  const raw = readText(relativePath);
  const marker = "---";
  const idx = raw.indexOf(marker);
  if (idx === -1) return raw;
  const afterHeader = raw.slice(idx + marker.length).trim();
  const secondIdx = afterHeader.indexOf(marker);
  return secondIdx === -1
    ? afterHeader
    : afterHeader.slice(secondIdx + marker.length).trim();
}

const { version } = JSON.parse(readText("app.json")).expo;
const releaseNotesFr = readOptional(
  `store/release-notes/${version}-fr.txt`,
  "store/release-notes/1.0.0-fr.txt",
);
const releaseNotesEn = readOptional(
  `store/release-notes/${version}-en.txt`,
  "store/release-notes/1.0.0-en.txt",
);

const config = {
  configVersion: 0,
  apple: {
    version,
    copyright: "© 2026 PokeMarket SAS",
    categories: ["SHOPPING", "LIFESTYLE"],
    info: {
      "fr-FR": {
        title: "PokeMarket",
        subtitle: readText("store/app-store/subtitle-fr.txt"),
        description: readText("store/app-store/description-fr.md"),
        keywords: keywordsFromFile("store/app-store/keywords-fr.txt"),
        releaseNotes: releaseNotesFr,
        promoText: readText("store/app-store/promotional-text-fr.txt"),
        marketingUrl: "https://pokemarket.app",
        supportUrl: "https://pokemarket.app/support",
        privacyPolicyUrl: "https://pokemarket.app/legal/privacy",
      },
      "en-US": {
        title: "PokeMarket",
        subtitle: readText("store/app-store/subtitle-en.txt"),
        description: readText("store/app-store/description-en.md"),
        keywords: keywordsFromFile("store/app-store/keywords-en.txt"),
        releaseNotes: releaseNotesEn,
        promoText: readText("store/app-store/promotional-text-en.txt"),
        marketingUrl: "https://pokemarket.app",
        supportUrl: "https://pokemarket.app/support",
        privacyPolicyUrl: "https://pokemarket.app/legal/privacy",
      },
    },
    advisory: {
      alcoholTobaccoOrDrugUseOrReferences: "NONE",
      contests: "NONE",
      gambling: false,
      gamblingSimulated: "NONE",
      horrorOrFearThemes: "NONE",
      matureOrSuggestiveThemes: "NONE",
      medicalOrTreatmentInformation: "NONE",
      profanityOrCrudeHumor: "NONE",
      sexualContentGraphicAndNudity: "NONE",
      sexualContentOrNudity: "NONE",
      violenceCartoonOrFantasy: "NONE",
      violenceRealistic: "NONE",
      violenceRealisticProlongedGraphicOrSadistic: "NONE",
      unrestrictedWebAccess: false,
      userGeneratedContent: true,
      messagingAndChat: true,
      kidsAgeBand: null,
      ageRatingOverride: "NONE",
      koreaAgeRatingOverride: "NONE",
      seventeenPlus: false,
    },
    review: {
      firstName: "Antonin",
      lastName: "Fourcade",
      email: "review@pokemarket.app",
      phone: "+33600000000",
      demoUsername: "reviewer@pokemarket.app",
      demoPassword: "ReviewerPass2026!",
      notes: reviewNotesFromMarkdown("store/reviewer/notes-en.md"),
    },
    release: {
      automaticRelease: false,
      phasedRelease: true,
    },
  },
};

const outPath = path.join(mobileRoot, "store.config.json");
fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${outPath} (apple.version=${version})`);
