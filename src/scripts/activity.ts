/**
 * Whether the page is on screen at all.
 *
 * Deliberately coarse: another tab is in front, or the window is minimised.
 * That is the whole test.
 *
 * An earlier version also required `document.hasFocus()`, reasoning that a
 * window sitting behind another one is not being read. That fires far too
 * readily. Clicking the address bar blurs the page, so the scene froze and the
 * headline stopped typing while the reader was looking straight at it. Mobile
 * was worse: browsers there report no focus until the first touch, which held
 * the entire entrance paused on load.
 *
 * Visibility is the signal that actually means nobody can see the page.
 */

export type ActivityListener = (active: boolean) => void;

/** On screen. Not "focused" - see above. */
export function isActive(): boolean {
  return document.visibilityState === 'visible';
}

const listeners = new Set<ActivityListener>();
let current = true;
let bound = false;

function publish(): void {
  const next = isActive();
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener(next);
}

function bind(): void {
  if (bound) return;
  bound = true;
  current = isActive();
  document.addEventListener('visibilitychange', publish);
  // Restoring from the back/forward cache fires no visibility change.
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

/** Runs `fn` once the page is on screen, immediately if it already is. */
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
