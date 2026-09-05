/**
 * Typewriter headline.
 *
 * Types character-by-character rather than animating a measured width, so it is
 * correct at any font size - the previous implementation measured text at a
 * hardcoded 2.5rem while the CSS sized it with `clamp()`, which desynced the
 * caret from the text on every viewport that wasn't desktop-width.
 */

import { isActive, onActivityChange } from './activity';

export interface TypewriterOptions {
  phrases: readonly string[];
  typeMs?: number;
  deleteMs?: number;
  holdMs?: number;
  gapMs?: number;
  /**
   * How many leading phrases always play in order, as a greeting. Everything
   * after them is shuffled, and the greeting is dropped from later passes.
   * "Welcome" only means something the first time.
   */
  orderedPrefix?: number;
}

export class Typewriter {
  private readonly el: HTMLElement;
  private readonly phrases: readonly string[];
  private readonly typeMs: number;
  private readonly deleteMs: number;
  private readonly holdMs: number;
  private readonly gapMs: number;

  private readonly orderedPrefix: number;
  /** Indices into `phrases`, in the order they'll be shown this pass. */
  private order: number[] = [];
  private cursor = 0;
  private timer = 0;
  private stopped = false;
  /**
   * Identifies the active run loop. Returning to the page starts a new one,
   * and without this the previous loop keeps going too: two loops writing the
   * same element and both advancing the cursor, which scrambles the order.
   */
  private runId = 0;
  private releaseActivity: (() => void) | null = null;

  constructor(el: HTMLElement, options: TypewriterOptions) {
    this.el = el;
    this.phrases = options.phrases;
    this.typeMs = options.typeMs ?? 55;
    this.deleteMs = options.deleteMs ?? 26;
    this.holdMs = options.holdMs ?? 2200;
    this.gapMs = options.gapMs ?? 420;
    this.orderedPrefix = Math.min(options.orderedPrefix ?? 0, this.phrases.length);

    const head = this.phrases.map((_, i) => i).slice(0, this.orderedPrefix);
    this.order = [...head, ...this.shuffledTail()];
  }

  /** The non-greeting phrases, shuffled. */
  private shuffledTail(): number[] {
    const tail = this.phrases.map((_, i) => i).slice(this.orderedPrefix);
    for (let i = tail.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [tail[i], tail[j]] = [tail[j]!, tail[i]!];
    }
    return tail;
  }

  /** Empties the element so the caret can wait for its cue. */
  clear(): void {
    this.el.textContent = '';
  }

  /** Renders the first phrase with no animation. Used for reduced motion. */
  renderStatic(): void {
    this.el.textContent = this.phrases[0] ?? '';
    this.el.classList.add('is-static');
  }

  start(): void {
    if (this.phrases.length === 0) return;
    this.stopped = false;
    this.releaseActivity ??= onActivityChange(this.onActivity);
    this.runId += 1;
    void this.run(this.runId);
  }

  stop(): void {
    this.stopped = true;
    this.retire();
    this.releaseActivity?.();
    this.releaseActivity = null;
  }

  private onActivity = (active: boolean): void => {
    // Nothing to type at a page nobody can see; the loop re-checks on the way
    // back in.
    if (!active) {
      window.clearTimeout(this.timer);
      return;
    }
    if (this.stopped) return;
    // Bumping the id retires whatever loop was mid-await.
    this.runId += 1;
    void this.run(this.runId);
  };

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timer = window.setTimeout(resolve, ms);
    });
  }

  /** Stops any active loop without detaching listeners. */
  private retire(): void {
    this.runId += 1;
    window.clearTimeout(this.timer);
  }

  /** True while `id` is still the active loop and the page is being read. */
  private alive(id: number): boolean {
    return !this.stopped && id === this.runId && isActive();
  }

  private async run(id: number): Promise<void> {
    while (this.alive(id)) {
      const phrase = this.phrases[this.order[this.cursor] ?? 0] ?? '';

      this.el.dataset.state = 'typing';
      for (let i = 1; i <= phrase.length; i += 1) {
        if (!this.alive(id)) return;
        this.el.textContent = phrase.slice(0, i);
        await this.wait(this.typeMs);
      }

      this.el.dataset.state = 'holding';
      await this.wait(this.holdMs);
      if (!this.alive(id)) return;

      this.el.dataset.state = 'deleting';
      for (let i = phrase.length; i >= 0; i -= 1) {
        if (!this.alive(id)) return;
        this.el.textContent = phrase.slice(0, i);
        await this.wait(this.deleteMs);
      }

      this.cursor += 1;
      if (this.cursor >= this.order.length) {
        // Later passes skip the greeting and reshuffle the facts.
        this.order = this.shuffledTail();
        this.cursor = 0;
      }

      await this.wait(this.gapMs);
    }
  }
}
