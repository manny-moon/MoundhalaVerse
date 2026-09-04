/**
 * Whether the page is worth animating for.
 *
 * `document.hidden` only covers a backgrounded or minimised tab. A window
 * sitting fully visible behind another one is still "visible" by that measure,
 * so anything driven off visibility alone keeps rendering the scene and typing
 * the headline at readers who are somewhere else entirely. Focus closes that
 * gap, and the two together are what "active" means here.
 */

export type ActivityListener = (active: boolean) => void;

/** Visible and focused. Both, because either alone lets a case through. */
export function isActive(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
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
