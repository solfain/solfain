import { safeJsonParse } from '../../utils/security';

export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
export const ANILIST_GRAPHQL_URL = ANILIST_ENDPOINT;

const SESSION_CACHE_PREFIX = 'solfain:anilist:v1:';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_MEMORY_CACHE_ENTRIES = 120;

interface CacheRecord<T> {
  expiresAt: number;
  data: T;
}

const memoryCache = new Map<string, CacheRecord<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

export class AniListApiError extends Error {
  readonly status: number;
  readonly isRateLimit: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: { status?: number; isRateLimit?: boolean; retryAfterSeconds?: number | null } = {},
  ) {
    super(message);
    this.name = 'AniListApiError';
    this.status = options.status ?? 0;
    this.isRateLimit = options.isRateLimit ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function makeCacheKey(query: string, variables: Record<string, unknown>): string {
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  return `${SESSION_CACHE_PREFIX}${stableHash(`${normalizedQuery}::${JSON.stringify(variables)}`)}`;
}

function setBoundedMemoryCache<T>(key: string, record: CacheRecord<T>): void {
  if (memoryCache.has(key)) {
    memoryCache.delete(key);
  } else if (memoryCache.size >= MAX_MEMORY_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey !== undefined) {
      memoryCache.delete(oldestKey);
    }
  }
  memoryCache.set(key, record);
}

function pruneSessionCache(): void {
  try {
    const now = Date.now();
    const keysToDelete: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (!k || !k.startsWith(SESSION_CACHE_PREFIX)) continue;
      const raw = window.sessionStorage.getItem(k);
      if (!raw) {
        keysToDelete.push(k);
        continue;
      }
      try {
        const parsed = safeJsonParse(raw) as CacheRecord<unknown>;
        if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) {
          keysToDelete.push(k);
        }
      } catch {
        keysToDelete.push(k);
      }
    }
    keysToDelete.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // Ignore storage inspection failures
  }
}

function readCache<T>(key: string): T | null {
  const now = Date.now();
  const mem = memoryCache.get(key) as CacheRecord<T> | undefined;
  if (mem) {
    if (mem.expiresAt > now) {
      // Refresh LRU position
      memoryCache.delete(key);
      memoryCache.set(key, mem);
      return mem.data;
    }
    memoryCache.delete(key);
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = safeJsonParse(raw) as CacheRecord<T>;
    if (parsed && typeof parsed.expiresAt === 'number' && parsed.expiresAt > now) {
      setBoundedMemoryCache(key, parsed);
      return parsed.data;
    }
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage unavailability
  }

  return null;
}

function writeCache<T>(key: string, data: T, ttlMs: number): void {
  const record: CacheRecord<T> = {
    expiresAt: Date.now() + ttlMs,
    data,
  };
  setBoundedMemoryCache(key, record);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(record));
  } catch {
    pruneSessionCache();
    try {
      window.sessionStorage.setItem(key, JSON.stringify(record));
    } catch {
      // Ignore quota exceeded
    }
  }
}

export function clearAniListCache(): void {
  memoryCache.clear();
  inflightRequests.clear();
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // Ignore
  }
}

export interface AniListRequestOptions {
  ttlMs?: number;
  signal?: AbortSignal;
  bypassCache?: boolean;
}

function createTimedSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void; didTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => {
    controller.abort();
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const cleanup = () => {
    globalThis.clearTimeout(timer);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  };

  return {
    signal: controller.signal,
    cleanup,
    didTimeout: () => timedOut,
  };
}

export async function anilistRequest<TData>(
  query: string,
  variables: Record<string, unknown> = {},
  options: AniListRequestOptions = {},
): Promise<TData> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const cacheKey = makeCacheKey(query, variables);

  if (!options.bypassCache) {
    const cached = readCache<TData>(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  if (!options.signal) {
    const inflight = inflightRequests.get(cacheKey) as Promise<TData> | undefined;
    if (inflight) {
      return inflight;
    }
  }

  const timed = createTimedSignal(options.signal, REQUEST_TIMEOUT_MS);

  const task = (async (): Promise<TData> => {
    let response: Response;
    try {
      response = await fetch(ANILIST_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: timed.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError' && !timed.didTimeout()) {
        throw error;
      }
      if (timed.didTimeout()) {
        throw new AniListApiError(
          'AniList took too long to respond. Please check your connection and retry.',
        );
      }
      throw new AniListApiError(
        'Unable to reach AniList right now. Check your network connection and try again.',
      );
    } finally {
      timed.cleanup();
    }

    if (response.status === 429) {
      const retryHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryHeader ? Number.parseInt(retryHeader, 10) : null;
      throw new AniListApiError(
        'AniList rate limit reached. Please wait a moment and retry.',
        {
          status: 429,
          isRateLimit: true,
          retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
        },
      );
    }

    let payload: { data?: TData; errors?: Array<{ message?: string; status?: number }> };
    try {
      payload = (await response.json()) as {
        data?: TData;
        errors?: Array<{ message?: string; status?: number }>;
      };
    } catch {
      throw new AniListApiError(`Unexpected response from AniList (HTTP ${response.status}).`, {
        status: response.status,
      });
    }

    if (!response.ok || (payload.errors && payload.errors.length > 0)) {
      const firstError = payload.errors?.[0];
      const status = firstError?.status ?? response.status;
      throw new AniListApiError(
        firstError?.message || `AniList request failed (HTTP ${response.status}).`,
        {
          status,
          isRateLimit: status === 429,
        },
      );
    }

    if (!payload.data) {
      throw new AniListApiError('AniList returned an empty data payload.', {
        status: response.status,
      });
    }

    if (ttlMs > 0) {
      writeCache(cacheKey, payload.data, ttlMs);
    }

    return payload.data;
  })();

  if (!options.signal) {
    inflightRequests.set(cacheKey, task);
    void task.then(
      () => {
        inflightRequests.delete(cacheKey);
      },
      () => {
        inflightRequests.delete(cacheKey);
      },
    );
  }

  return task;
}
