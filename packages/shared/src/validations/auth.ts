import { z } from "zod";

/** Shared email validation for forgot-password (web + mobile). */
export const forgotPasswordSchema = z.object({
  email: z.string().email("Email invalide"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
