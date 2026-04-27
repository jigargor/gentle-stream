import type { CreatorProvider } from "@/lib/db/creatorStudio";

export interface KnownModel {
  id: string;
  label: string;
}

export const KNOWN_MODELS: Record<CreatorProvider, KnownModel[]> = {
  anthropic: [
    { id: "claude-opus-4-7",           label: "Claude Opus 4.7" },
    { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-4o",      label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "o3",          label: "o3" },
    { id: "o4-mini",     label: "o4 mini" },
  ],
  gemini: [
    { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
};

export const ALL_KNOWN_MODEL_IDS: ReadonlySet<string> = new Set(
  (Object.values(KNOWN_MODELS) as KnownModel[][]).flat().map((m) => m.id)
);
