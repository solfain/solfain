const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{6,20}$/;

const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface SanitizeUrlOptions {
  httpsOnly?: boolean;
  maxLength?: number;
}

/**
 * Validates and normalizes external URLs, rejecting dangerous schemes
 * (`javascript:`, `data:`, `vbscript:`, `file:`), embedded credentials,
 * and oversize inputs.
 */
export function sanitizeHttpUrl(
  raw: unknown,
  options: SanitizeUrlOptions = {},
): string | null {
  if (typeof raw !== 'string') return null;
  const maxLength = options.maxLength ?? 2048;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > maxLength) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  const httpsOnly = options.httpsOnly ?? true;
  if (httpsOnly) {
    if (parsed.protocol !== 'https:') return null;
  } else if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  return parsed.toString();
}

/**
 * Validates CSS hex colors so untrusted metadata/storage strings cannot
 * inject arbitrary CSS rules or url() expressions.
 */
export function sanitizeHexColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * Strips control characters, trims whitespace, and enforces a bounded length.
 */
export function sanitizePlainText(raw: unknown, maxLength = 300): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(CONTROL_CHARS_REGEX, '').trim().slice(0, maxLength);
}

/**
 * Validates an official AniList trailer object and returns a privacy-enhanced
 * `youtube-nocookie.com` embed URL only when the video ID is strictly valid.
 */
export function buildSafeYoutubeEmbedUrl(
  trailer: { id?: unknown; site?: unknown } | null | undefined,
): string | null {
  if (!trailer || typeof trailer.site !== 'string' || typeof trailer.id !== 'string') {
    return null;
  }
  if (trailer.site.trim().toLowerCase() !== 'youtube') {
    return null;
  }
  const cleanId = trailer.id.trim();
  if (!YOUTUBE_VIDEO_ID_REGEX.test(cleanId)) {
    return null;
  }
  return `https://www.youtube-nocookie.com/embed/${cleanId}?rel=0&modestbranding=1`;
}

/**
 * Parses untrusted JSON (localStorage / imported backup files) with a strict
 * byte cap and prototype-pollution key filtering.
 */
export function safeJsonParse(raw: string, maxBytes = 1_048_576): unknown {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > maxBytes) {
    throw new Error('JSON payload is empty or exceeds maximum allowed size.');
  }
  return JSON.parse(raw, (key, value) => {
    if (DANGEROUS_OBJECT_KEYS.has(key)) {
      return undefined;
    }
    return value;
  });
}
