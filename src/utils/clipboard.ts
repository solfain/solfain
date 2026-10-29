/**
 * Copies plain text to the user's clipboard reliably across both top-level
 * browser tabs and cross-origin embedded preview iframes (where the Async
 * Clipboard API is often blocked by Permissions-Policy without
 * `allow="clipboard-write"`, while synchronous `document.execCommand('copy')`
 * inside a user click gesture succeeds).
 */
export function legacyExecCommandCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;

  const previousActive =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  document.body.appendChild(textarea);

  let copied = false;
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    copied =
      typeof document.execCommand === 'function' &&
      document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
    if (previousActive && typeof previousActive.focus === 'function') {
      try {
        previousActive.focus({ preventScroll: true });
      } catch {
        // Ignore focus restoration errors
      }
    }
  }

  return copied;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || typeof window === 'undefined') return false;

  let isCrossOriginFrame = false;
  try {
    isCrossOriginFrame = window.self !== window.top;
  } catch {
    isCrossOriginFrame = true;
  }

  // Inside an embedded iframe, run synchronous execCommand('copy') first while
  // transient user activation is guaranteed on the exact click tick.
  if (isCrossOriginFrame) {
    const syncCopied = legacyExecCommandCopy(text);
    if (syncCopied) return true;
  }

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to synchronous execCommand fallback
    }
  }

  return legacyExecCommandCopy(text);
}
