import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { create } from 'zustand';
import type { ServiceContext } from '@mnemo/services';

const ServicesContext = createContext<ServiceContext | null>(null);

export function ServicesProvider({
  value,
  children,
}: {
  value: ServiceContext;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): ServiceContext {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used inside <ServicesProvider>');
  return ctx;
}

/** Global data version: bumped after every mutation so queries refetch. */
interface DataVersionState {
  version: number;
  bump: () => void;
}

export const useDataVersion = create<DataVersionState>((set) => ({
  version: 0,
  bump: () => {
    set((s) => ({ version: s.version + 1 }));
  },
}));

export type QueryState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

/**
 * Runs an async read against the services and re-runs it when `deps` or the data version change.
 * Keeps showing the previous data while refetching, to avoid flicker.
 */
export function useQuery<T>(
  fn: (ctx: ServiceContext) => Promise<T>,
  deps: readonly unknown[],
): QueryState<T> & { refetch: () => void } {
  const ctx = useServices();
  const version = useDataVersion((s) => s.version);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fn(ctx).then(
      (data) => {
        if (!cancelled) setState({ status: 'success', data });
      },
      (error: unknown) => {
        if (!cancelled)
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are provided by the caller
  }, [ctx, version, tick, ...deps]);

  return { ...state, refetch };
}

/** Wraps a mutation: runs it, then bumps the data version. */
export function useMutation<A extends unknown[], R>(
  fn: (ctx: ServiceContext, ...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const ctx = useServices();
  const bump = useDataVersion((s) => s.bump);
  // Always call the latest closure: callers often capture component state (e.g. the import mode).
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback(
    async (...args: A) => {
      const result = await latest.current(ctx, ...args);
      bump();
      return result;
    },
    [ctx, bump],
  );
}
