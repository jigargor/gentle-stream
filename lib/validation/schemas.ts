import { z } from "zod";
import { CATEGORIES } from "@/lib/constants";

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const categorySchema = z.enum(
  CATEGORIES as unknown as [string, ...string[]]
);

export const nonEmptyStringSchema = (maxLen: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLen);

export const nullableTrimmedStringSchema = (maxLen: number) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .nullable()
    .optional()
    .transform((value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    });

export const gameTypeSchema = z.enum([
  "sudoku",
  "word_search",
  "killer_sudoku",
  "nonogram",
  "crossword",
  "connections",
]);

export const gameDifficultySchema = z.enum(["easy", "medium", "hard"]);
