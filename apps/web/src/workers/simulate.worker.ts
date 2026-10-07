import type { SimulationInput, SimulationResult } from '@mnemo/core';
import { simulateWorkload } from '@mnemo/core';

export interface SimulateRequest {
  id: number;
  inputs: SimulationInput[];
}

export interface SimulateResponse {
  id: number;
  results?: SimulationResult[];
  error?: string;
}

// The app is type-checked with the DOM lib; type only what the worker scope needs.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<SimulateRequest>) => void) | null;
  postMessage: (message: SimulateResponse) => void;
};

scope.onmessage = (e) => {
  try {
    scope.postMessage({
      id: e.data.id,
      results: e.data.inputs.map((input) => simulateWorkload(input)),
    });
  } catch (error) {
    scope.postMessage({
      id: e.data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
