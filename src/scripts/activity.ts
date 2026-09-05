/**
 * Whether the page is worth animating for.
 *
 * `document.hidden` only covers a backgrounded or minimised tab. A window
 * sitting fully visible behind another one is still "visible" by that measure,
 * so anything driven off visibility alone keeps rendering the scene and typing
 * the headline at readers who are somewhere else entirely. Focus closes that
 * gap on a desktop.
 *
 * It is no help on a phone, though, and actively harmful there: a phone shows
 * one page at a time, so there is no visible-but-unfocused state to detect,
 * and mobile browsers routinely report no focus at all until the first touch.
 * Requiring it held the whole entrance frozen until the reader tapped the
 * screen. So focus is consulted only where windows can actually overlap.
 */

export type ActivityListener = (active: boolean) => void;

/** Live, so plugging in a mouse is picked up rather than fixed at load. */
const pointingDevice =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: hover) and (pointer: fine)')
    : null;

/** Visible, and focused too on anything driving a real cursor. */
export function isActive(): boolean {
  if (document.visibilityState !== 'visible') return false;
  if (!pointingDevice?.matches) return true;
  return document.hasFocus();
}

const listeners = new Set<ActivityListener>();
let current = true;
let bound = false;

function publish(): void {
  const next = isActive();
  // Focus and visibility often change together; only announce real edges.
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener(next);
}

function bind(): void {
  if (bound) return;
  bound = true;
  current = isActive();
  document.addEventListener('visibilitychange', publish);
  window.addEventListener('focus', publish);
  window.addEventListener('blur', publish);
  // Restoring from the back/forward cache fires neither of the above.
  window.addEventListener('pageshow', publish);
}

/** Subscribes to activity changes. Returns an unsubscribe function. */
export function onActivityChange(listener: ActivityListener): () => void {
  bind();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Runs `fn` once the page is active, immediately if it already is. */
export function whenActive(fn: () => void): void {
  if (isActive()) {
    fn();
    return;
  }
  const off = onActivityChange((active) => {
    if (!active) return;
    off();
    fn();
  });
}
