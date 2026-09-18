/**
 * Data-fetching hooks.
 *
 * Every screen that reads from the server goes through `useApi`, which means every screen
 * gets the same three states — loading, error, data — instead of each page inventing its own.
 * Pages that hard-code their content cannot show a real verdict, and a metrology tool whose
 * numbers are decorative is worse than no tool.
 *
 * Requests are aborted when the component unmounts or the key changes, so a slow response
 * from a page the officer has already left cannot overwrite what is now on screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  /** True while any request is in flight, including a refetch of data already held. */
  loading: boolean;
  /**
   * True only while the *first* load is in flight.
   *
   * The distinction matters more than it looks. A screen that blocks on `loading` unmounts its
   * children on every refetch, and unmounting throws away whatever they were holding — the
   * validation findings an officer just triggered, the rows they just computed. Block on
   * `initialLoading`; show a quiet indicator for the rest.
   */
  initialLoading: boolean;
  error: string | null;
  /** Re-run the request. */
  reload: () => void;
}

export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Held in a ref so changing the fetcher identity between renders does not re-fire the
  // request; `deps` is the declared cache key, exactly as with useEffect.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let live = true;

    setLoading(true);
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!live) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!live || controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, initialLoading: loading && data === null, error, reload };
}

/**
 * A mutation: something the officer triggers, which can fail and must say so.
 *
 * Separate from `useApi` because the failure of a write needs to be shown next to the control
 * that caused it, not as a whole-page error.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): {
  run: (...args: TArgs) => Promise<TResult | null>;
  pending: boolean;
  error: string | null;
  reset: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err: unknown) {
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending, error, reset: () => setError(null) };
}

/**
 * A cache entry: the in-flight (or already-settled) promise, plus the resolved value once
 * there is one. Kept at module scope so it survives the mounting and unmounting of whatever
 * component asked for it — the point of this hook.
 */
interface CacheEntry<T> {
  promise: Promise<T>;
  value?: T;
}
const resourceCache = new Map<string, CacheEntry<unknown>>();

/**
 * Like `useApi`, for a resource that is the same for every caller and does not change during a
 * session — the R 76-2 form layouts being the motivating case (MA-07). `useApi` refetches on
 * every mount, which is correct for report data (it changes) and wasteful for a static file
 * that opening the Observations tab a second time asked for again, sometimes visibly slowly.
 *
 * The fetch happens once per `key` per page load: the first caller populates `resourceCache`,
 * every later caller — including one that mounts before the first request has even resolved —
 * reads the same promise instead of starting a second request. `reload()` is provided for
 * symmetry with `useApi` but is expected to be rare, since the whole point of this hook is a
 * resource that does not need refetching.
 */
export function useCachedResource<T>(key: string, fetcher: () => Promise<T>): AsyncState<T> {
  const existing = resourceCache.get(key) as CacheEntry<T> | undefined;
  const [data, setData] = useState<T | null>(existing?.value ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(existing?.value === undefined);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    let entry = resourceCache.get(key) as CacheEntry<T> | undefined;

    // A fresh key, or an explicit reload, starts a new request; anything else reuses whatever
    // is already in flight or already resolved.
    if (!entry || nonce > 0) {
      entry = { promise: fetcher() };
      resourceCache.set(key, entry as CacheEntry<unknown>);
    }

    if (entry.value !== undefined) {
      setData(entry.value);
      setLoading(false);
      return;
    }

    setLoading(true);
    entry.promise
      .then((result) => {
        resourceCache.set(key, { promise: entry!.promise, value: result });
        if (live) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        // Do not cache a failure — the next mount should get a real chance to retry rather than
        // replay the same rejection forever.
        resourceCache.delete(key);
        if (live) setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, initialLoading: loading && data === null, error, reload };
}

/**
 * Debounced value, for the live mpe preview.
 *
 * An officer typing "4500" passes through 4, 45 and 450 on the way. Without a delay each of
 * those is a request, and the answers can arrive out of order — so the displayed limit would
 * briefly be the one for a load nobody entered.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
