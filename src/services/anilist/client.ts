export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

export class AniListApiError extends Error {
  readonly status: number;
  readonly isRateLimited: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: {
      status?: number;
      isRateLimited?: boolean;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(message);
    this.name = 'AniListApiError';
    this.status = options.status ?? 0;
    this.isRateLimited = options.isRateLimited ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

interface CacheRecord<T> {
  data: T;
  expiresAt: number;
}

const SESSION_CACHE_PREFIX = 'solfain:anilist:v1:';
const memoryCache = new Map<string, CacheRecord<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

function buildCacheKey(query: string, variables?: Record<string, unknown>): string {
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  const sortedVars = variables
    ? Object.keys(variables)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          const val = variables[key];
          if (val !== undefined && val !== '') {
            acc[key] = val;
          }
          return acc;
        }, {})
    : {};
  return `${normalizedQuery}::${JSON.stringify(sortedVars)}`;
}

function readCached<T>(key: string): T | null {
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem) {
    if (mem.expiresAt > now) {
      return mem.data as T;
    }
    memoryCache.delete(key);
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheRecord<T>;
    if (parsed && typeof parsed.expiresAt === 'number' && parsed.expiresAt > now && 'data' in parsed) {
      memoryCache.set(key, parsed);
      return parsed.data;
    }
    window.sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
  } catch {
    // Ignore storage access errors in restricted browsing modes
  }

  return null;
}

function writeCached<T>(key: string, data: T, ttlMs: number): void {
  if (ttlMs <= 0) return;
  const record: CacheRecord<T> = {
    data,
    expiresAt: Date.now() + ttlMs,
  };
  memoryCache.set(key, record);
  try {
    window.sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(record));
  } catch {
    // Ignore quota exceeded errors
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
    for (const k of keysToRemove) {
      window.sessionStorage.removeItem(k);
    }
  } catch {
    // Ignore storage access errors
  }
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: Array<{
    message?: string;
    status?: number;
  }>;
}

export interface GraphQLRequestOptions {
  ttlMs?: number;
  signal?: AbortSignal;
  bypassCache?: boolean;
}

export async function anilistRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  options: GraphQLRequestOptions = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
  const cacheKey = buildCacheKey(query, variables);

  if (!options.bypassCache) {
    const cached = readCached<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  const canDeduplicate = !options.signal;
  if (canDeduplicate) {
    const existing = inflightRequests.get(cacheKey);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const execute = async (): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(ANILIST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: variables ?? {},
        }),
        signal: options.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        throw err;
      }
      throw new AniListApiError(
        'Unable to reach AniList right now. Check your network connection and try again.',
      );
    }

    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null;

    if (response.status === 429) {
      const waitLabel =
        retryAfterSeconds && Number.isFinite(retryAfterSeconds)
          ? ` Please wait ${retryAfterSeconds} seconds before retrying.`
          : ' Please wait a moment before retrying.';
      throw new AniListApiError(`AniList rate limit reached.${waitLabel}`, {
        status: 429,
        isRateLimited: true,
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
      });
    }

    let payload: GraphQLResponse<T>;
    try {
      payload = (await response.json()) as GraphQLResponse<T>;
    } catch {
      throw new AniListApiError(
        `Received an invalid response from AniList (HTTP ${response.status}).`,
        { status: response.status },
      );
    }

    if (!response.ok || (payload.errors && payload.errors.length > 0 && !payload.data)) {
      const firstError = payload.errors?.[0];
      const status = firstError?.status ?? response.status;
      const is429 = status === 429;
      if (status === 404) {
        throw new AniListApiError('The requested anime entry could not be found on AniList.', {
          status: 404,
        });
      }
      throw new AniListApiError(
        firstError?.message || `AniList request failed (HTTP ${status}).`,
        {
          status,
          isRateLimited: is429,
          retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
        },
      );
    }

    if (!payload.data) {
      throw new AniListApiError('AniList returned an empty data payload.', {
        status: response.status,
      });
    }

    writeCached(cacheKey, payload.data, ttlMs);
    return payload.data;
  };

  const promise = execute().finally(() => {
    if (canDeduplicate) {
      inflightRequests.delete(cacheKey);
    }
  });

  if (canDeduplicate) {
    inflightRequests.set(cacheKey, promise);
  }

  return promise;
}
