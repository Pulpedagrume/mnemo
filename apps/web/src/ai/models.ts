import type { AiModel } from '@mnemo/core';

export interface AiModelInfo {
  /** WebLLM prebuilt model id (weights on huggingface.co/mlc-ai, Apache-2.0 Qwen3.5). */
  id: string;
  /** Approximate one-time download, in megabytes. */
  downloadMB: number;
  /** Approximate graphics memory needed, in megabytes. */
  memoryMB: number;
}

export const AI_MODELS: Record<AiModel, AiModelInfo> = {
  standard: { id: 'Qwen3.5-2B-q4f16_1-MLC', downloadMB: 1100, memoryMB: 2300 },
  light: { id: 'Qwen3.5-0.8B-q4f16_1-MLC', downloadMB: 450, memoryMB: 1700 },
};

/** Removes reasoning blocks some models emit before the answer. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '');
}
