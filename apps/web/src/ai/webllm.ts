// Single entry point for WebLLM so the library lands in its own lazily loaded chunk ("webllm-*"),
// which the PWA does not precache (see vite.config.ts).
export {
  CreateWebWorkerMLCEngine,
  deleteModelAllInfoInCache,
  hasModelInCache,
  type WebWorkerMLCEngine,
} from '@mlc-ai/web-llm';
