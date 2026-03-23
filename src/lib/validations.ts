import { z } from "zod";
import {
  CARD_CONDITIONS,
  GRADING_COMPANIES,
  WEIGHT_CLASSES,
  SHIPPING_COUNTRIES,
  DISPUTE_REASONS,
  LIMITS,
} from "./constants";

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

export const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  username: z
    .string()
    .min(3, "Le pseudo doit contenir au moins 3 caractères")
    .max(30, "Le pseudo doit contenir au maximum 30 caractères")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Lettres, chiffres, tirets et underscores uniquement",
    ),
});

export const profileUpdateSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  bio: z.string().max(500).optional(),
  country_code: z.string().length(2).optional(),
  address_line: z.string().max(300).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  instagram_url: z.string().optional().or(z.literal("")),
  facebook_url: z.string().optional().or(z.literal("")),
  tiktok_url: z.string().optional().or(z.literal("")),
});

export const listingCreateSchema = z
  .object({
    title: z
      .string()
      .min(
        LIMITS.TITLE_MIN_LENGTH,
        `Le titre doit contenir au moins ${LIMITS.TITLE_MIN_LENGTH} caractères`,
      )
      .max(
        LIMITS.TITLE_MAX_LENGTH,
        `Le titre doit contenir au maximum ${LIMITS.TITLE_MAX_LENGTH} caractères`,
      ),
    price_seller: z.number().positive("Le prix doit être supérieur à 0"),
    condition: z.enum(CARD_CONDITIONS).optional(),
    is_graded: z.boolean().default(false),
    grading_company: z.enum(GRADING_COMPANIES).optional(),
    grade_note: z.number().min(1).max(10).optional(),
    delivery_weight_class: z.enum(WEIGHT_CLASSES).default("S"),
    cover_image_url: z.string().url("Photo recto requise"),
    back_image_url: z.string().url("Photo verso requise"),
    card_ref_id: z.string().optional(),
    card_series: z.string().optional(),
    card_block: z.string().optional(),
    card_number: z.string().optional(),
    card_language: z.string().optional(),
    card_rarity: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.is_graded) return !!data.grading_company && !!data.grade_note;
      return !!data.condition;
    },
    {
      message: "État de la carte ou informations de gradation requises",
      path: ["condition"],
    },
  );

export const offerSchema = z.object({
  listing_id: z.string().uuid(),
  offer_amount: z.number().positive("Le montant doit être supérieur à 0"),
  conversation_id: z.string().uuid().optional(),
});

export const messageSchema = z.object({
  content: z
    .string()
    .min(1, "Le message ne peut pas être vide")
    .max(
      LIMITS.MAX_MESSAGE_LENGTH,
      `Maximum ${LIMITS.MAX_MESSAGE_LENGTH} caractères`,
    ),
});

export const checkoutSchema = z.object({
  listing_id: z.string().uuid(),
  shipping_country: z.enum(SHIPPING_COUNTRIES),
  shipping_address_line: z.string().min(1, "Adresse requise"),
  shipping_address_city: z.string().min(1, "Ville requise"),
  shipping_address_postcode: z.string().min(1, "Code postal requis"),
});

export const shippingSchema = z.object({
  tracking_number: z.string().min(1, "Numéro de suivi requis"),
  tracking_url: z
    .string()
    .url("URL de suivi invalide")
    .optional()
    .or(z.literal("")),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const disputeSchema = z.object({
  reason: z.enum(DISPUTE_REASONS),
  description: z
    .string()
    .min(10, "Décrivez le problème en au moins 10 caractères"),
});

export const savedSearchSchema = z.object({
  name: z.string().min(1, "Nom requis").max(100),
});

export const ocrRequestSchema = z.object({
  image_url: z.string().url("URL d'image invalide"),
});

export const ocrParsedSchema = z.object({
  name: z.string().nullable().default(null),
  card_number: z.string().nullable().default(null),
  language: z.string().nullable().default(null),
});

export const ocrCandidateSchema = z.object({
  card_key: z.string(),
  card_id: z.string(),
  name: z.string(),
  set_id: z.string().nullable(),
  set_name: z.string().nullable(),
  series_name: z.string().nullable(),
  local_id: z.string().nullable(),
  set_official_count: z.number().nullable(),
  hp: z.number().nullable(),
  rarity: z.string().nullable(),
  language: z.string(),
  image_url: z.string().nullable(),
  confidence: z.number().min(0).max(100),
});

export const ocrResponseSchema = z.object({
  parsed: ocrParsedSchema,
  candidates: z.array(ocrCandidateSchema),
});
