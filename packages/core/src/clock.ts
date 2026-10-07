/** Source of the current time, in milliseconds since the UTC epoch. Always injected. */
export interface Clock {
  now(): number;
}

/** A clock frozen at `ms`, advanced manually. Used by tests and simulations. */
export interface ManualClock extends Clock {
  set(ms: number): void;
  advance(ms: number): void;
}

export function manualClock(start: number): ManualClock {
  let current = start;
  return {
    now: () => current,
    set: (ms) => {
      current = ms;
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

/** The real wall clock. Only application entry points should construct this. */
export const systemClock: Clock = {
  // eslint-disable-next-line no-restricted-properties -- the single sanctioned read of the wall clock
  now: () => Date.now(),
};
