import { create } from 'zustand';
import type { AiModel } from '@mnemo/core';
import type { ChatMessage } from '@mnemo/services';
import { AI_MODELS, stripThinking } from './models';
import type { WebWorkerMLCEngine } from './webllm';

/**
 * The in-browser model (WebLLM + WebGPU). Weights are downloaded once from Hugging Face and kept
 * in the browser cache; questions and cards never leave the device.
 */
export type AiStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; model: AiModel; progress: number }
  | { kind: 'ready'; model: AiModel }
  | { kind: 'error'; message: string };

export const useAiStatus = create<{ status: AiStatus }>(() => ({ status: { kind: 'idle' } }));

const setStatus = (status: AiStatus) => {
  useAiStatus.setState({ status });
};

let engine: WebWorkerMLCEngine | undefined;
let loaded: AiModel | undefined;

/** WebGPU runs the model on the graphics chip; without it the assistant is unavailable. */
export async function webGpuAvailable(): Promise<boolean> {
  // Not every browser exposes WebGPU, whatever the DOM typings say.
  if (!('gpu' in navigator)) return false;
  try {
    return (await navigator.gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

export async function isModelDownloaded(model: AiModel): Promise<boolean> {
  try {
    const { hasModelInCache } = await import('./webllm');
    return await hasModelInCache(AI_MODELS[model].id);
  } catch {
    return false;
  }
}

/** Downloads the model the first time, then loads it into the worker. */
export async function loadModel(model: AiModel): Promise<void> {
  if (engine && loaded === model) {
    setStatus({ kind: 'ready', model });
    return;
  }
  setStatus({ kind: 'loading', model, progress: 0 });
  const onProgress = (report: { progress: number }) => {
    setStatus({ kind: 'loading', model, progress: report.progress });
  };
  try {
    const webllm = await import('./webllm');
    if (engine) {
      engine.setInitProgressCallback(onProgress);
      await engine.reload(AI_MODELS[model].id);
    } else {
      engine = await webllm.CreateWebWorkerMLCEngine(
        new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' }),
        AI_MODELS[model].id,
        { initProgressCallback: onProgress },
      );
    }
    loaded = model;
    setStatus({ kind: 'ready', model });
  } catch (e) {
    loaded = undefined;
    setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

/** Streams an answer; `onText` receives the text so far. Resolves with the full answer. */
export async function ask(
  messages: ChatMessage[],
  onText: (text: string) => void,
): Promise<string> {
  if (!engine) throw new Error('The model is not loaded');
  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.4,
    // Small models tend to loop; a mild penalty keeps answers varied.
    frequency_penalty: 0.6,
    presence_penalty: 0.3,
    max_tokens: 600,
    extra_body: { enable_thinking: false },
  });
  let raw = '';
  for await (const chunk of stream) {
    raw += chunk.choices[0]?.delta.content ?? '';
    onText(stripThinking(raw));
  }
  return stripThinking(raw).trim();
}

/** Stops the answer being written (what was written so far is kept). */
export function stopAnswer(): void {
  engine?.interruptGenerate();
}

/** Frees the graphics memory and removes the model files from this browser. */
export async function deleteModel(model: AiModel): Promise<void> {
  if (engine && loaded === model) {
    await engine.unload();
    loaded = undefined;
    setStatus({ kind: 'idle' });
  }
  const { deleteModelAllInfoInCache } = await import('./webllm');
  await deleteModelAllInfoInCache(AI_MODELS[model].id);
}
