/**
 * Typewriter headline.
 *
 * Types character-by-character rather than animating a measured width, so it is
 * correct at any font size - the previous implementation measured text at a
 * hardcoded 2.5rem while the CSS sized it with `clamp()`, which desynced the
 * caret from the text on every viewport that wasn't desktop-width.
 */

export interface TypewriterOptions {
  phrases: readonly string[];
  typeMs?: number;
  deleteMs?: number;
  holdMs?: number;
  gapMs?: number;
}

export class Typewriter {
  private readonly el: HTMLElement;
  private readonly phrases: readonly string[];
  private readonly typeMs: number;
  private readonly deleteMs: number;
  private readonly holdMs: number;
  private readonly gapMs: number;

  private index = 0;
  private timer = 0;
  private stopped = false;

  constructor(el: HTMLElement, options: TypewriterOptions) {
    this.el = el;
    this.phrases = options.phrases;
    this.typeMs = options.typeMs ?? 55;
    this.deleteMs = options.deleteMs ?? 26;
    this.holdMs = options.holdMs ?? 2200;
    this.gapMs = options.gapMs ?? 420;

    // Start on a random phrase so a reload doesn't always open the same way,
    // but never mid-list on the first paint.
    this.index = Math.floor(Math.random() * this.phrases.length);
  }

  /** Renders the first phrase with no animation. Used for reduced motion. */
  renderStatic(): void {
    this.el.textContent = this.phrases[0] ?? '';
    this.el.classList.add('is-static');
  }

  start(): void {
    if (this.phrases.length === 0) return;
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    // Nothing to animate off-screen; the loop re-checks on wake.
    if (document.hidden) window.clearTimeout(this.timer);
    else if (!this.stopped) void this.run();
  };

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timer = window.setTimeout(resolve, ms);
    });
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      if (document.hidden) return;

      const phrase = this.phrases[this.index] ?? '';

      this.el.dataset.state = 'typing';
      for (let i = 1; i <= phrase.length; i += 1) {
        if (this.stopped || document.hidden) return;
        this.el.textContent = phrase.slice(0, i);
        await this.wait(this.typeMs);
      }

      this.el.dataset.state = 'holding';
      await this.wait(this.holdMs);
      if (this.stopped || document.hidden) return;

      this.el.dataset.state = 'deleting';
      for (let i = phrase.length; i >= 0; i -= 1) {
        if (this.stopped || document.hidden) return;
        this.el.textContent = phrase.slice(0, i);
        await this.wait(this.deleteMs);
      }

      this.index = (this.index + 1) % this.phrases.length;
      await this.wait(this.gapMs);
    }
  }
}
