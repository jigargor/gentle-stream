import type { LlmProvider } from "@/lib/llm/client";

export interface LlmProviderCapabilities {
  supportsNativeJsonMode: boolean;
  supportsJsonSchemaResponseFormat: boolean;
  supportsStreamingText: boolean;
  supportsStreamingJsonChunks: boolean;
  supportsToolCallingForSchema: boolean;
  requiresPromptOnlyJsonFallback: boolean;
}

const CAPABILITIES: Record<LlmProvider, LlmProviderCapabilities> = {
  openai: {
    supportsNativeJsonMode: true,
    supportsJsonSchemaResponseFormat: true,
    supportsStreamingText: true,
    supportsStreamingJsonChunks: true,
    supportsToolCallingForSchema: true,
    requiresPromptOnlyJsonFallback: false,
  },
  gemini: {
    supportsNativeJsonMode: true,
    supportsJsonSchemaResponseFormat: true,
    supportsStreamingText: true,
    supportsStreamingJsonChunks: true,
    supportsToolCallingForSchema: false,
    requiresPromptOnlyJsonFallback: false,
  },
  anthropic: {
    supportsNativeJsonMode: false,
    supportsJsonSchemaResponseFormat: false,
    supportsStreamingText: true,
    supportsStreamingJsonChunks: false,
    supportsToolCallingForSchema: true,
    requiresPromptOnlyJsonFallback: true,
  },
};

export function getProviderCapabilities(provider: LlmProvider): LlmProviderCapabilities {
  return CAPABILITIES[provider];
}
