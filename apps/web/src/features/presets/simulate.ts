import type { SimulationInput, SimulationResult } from '@mnemo/core';
import { simulateWorkload } from '@mnemo/core';
import type { SimulateRequest, SimulateResponse } from '../../workers/simulate.worker';

let worker: Worker | null = null;
let nextId = 1;

/** Runs simulations in a Web Worker (falls back to the main thread where workers are unavailable). */
export function runSimulations(inputs: SimulationInput[]): Promise<SimulationResult[]> {
  if (typeof Worker === 'undefined') return Promise.resolve(inputs.map((i) => simulateWorkload(i)));
  worker ??= new Worker(new URL('../../workers/simulate.worker.ts', import.meta.url), {
    type: 'module',
  });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<SimulateResponse>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (e.data.results) resolve(e.data.results);
      else reject(new Error(e.data.error ?? 'Simulation failed'));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, inputs } satisfies SimulateRequest);
  });
}
