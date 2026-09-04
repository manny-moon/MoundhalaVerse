/**
 * Modal controller.
 *
 * Panels live in the normal document flow - deliberately outside any 3D or
 * transformed ancestor, so nothing about the WebGL scene can affect how they
 * scale or position. Each open panel is a real `role="dialog"` with a focus
 * trap, Escape handling, focus restore, and a URL hash so any section can be
 * linked to directly.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ModalEvents {
  onOpen?: (id: string) => void;
  onClose?: () => void;
}

export class ModalController {
  private readonly scrim: HTMLElement;
  private readonly panels = new Map<string, HTMLElement>();
  private readonly events: ModalEvents;

  private openId: string | null = null;
  private lastFocused: HTMLElement | null = null;
  private scrollLockY = 0;

  constructor(root: ParentNode, scrim: HTMLElement, events: ModalEvents = {}) {
    this.scrim = scrim;
    this.events = events;

    for (const panel of root.querySelectorAll<HTMLElement>('[data-panel]')) {
      const id = panel.dataset.panel;
      if (id) this.panels.set(id, panel);
    }

    // Anything that opens a panel declares it, so no per-section wiring.
    for (const trigger of root.querySelectorAll<HTMLElement>('[data-open]')) {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        const id = trigger.dataset.open;
        if (id) this.open(id, trigger);
      });
    }

    for (const closer of root.querySelectorAll<HTMLElement>('[data-close]')) {
      closer.addEventListener('click', () => this.close());
    }

    this.scrim.addEventListener('click', () => this.close());
    document.addEventListener('keydown', this.onKeydown);
    window.addEventListener('hashchange', this.onHashChange);
  }

  get current(): string | null {
    return this.openId;
  }

  has(id: string): boolean {
    return this.panels.has(id);
  }

  /** Opens the panel named in the URL hash, if there is one. */
  openFromHash(): void {
    const id = window.location.hash.replace('#', '');
    if (id && this.panels.has(id)) this.open(id, null, { updateHash: false });
  }

  open(id: string, trigger: HTMLElement | null = null, options: { updateHash?: boolean } = {}): void {
    const panel = this.panels.get(id);
    if (!panel || this.openId === id) return;

    if (this.openId) this.hide(this.openId);

    this.lastFocused =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    this.openId = id;
    this.lockScroll();

    panel.hidden = false;
    // Next frame, so the transition has a start state to animate from.
    requestAnimationFrame(() => panel.classList.add('is-open'));

    this.scrim.hidden = false;
    requestAnimationFrame(() => this.scrim.classList.add('is-open'));

    document.body.dataset.modalOpen = 'true';

    const focusTarget =
      panel.querySelector<HTMLElement>('[data-autofocus]') ??
      panel.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });

    if (options.updateHash !== false) {
      history.replaceState(null, '', `#${id}`);
    }

    this.events.onOpen?.(id);
  }

  close(): void {
    if (!this.openId) return;

    this.hide(this.openId);
    this.openId = null;

    this.scrim.classList.remove('is-open');
    window.setTimeout(() => {
      if (!this.openId) this.scrim.hidden = true;
    }, 260);

    delete document.body.dataset.modalOpen;
    this.unlockScroll();

    history.replaceState(null, '', window.location.pathname + window.location.search);

    this.lastFocused?.focus({ preventScroll: true });
    this.lastFocused = null;

    this.events.onClose?.();
  }

  private hide(id: string): void {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.classList.remove('is-open');
    window.setTimeout(() => {
      if (this.openId !== id) panel.hidden = true;
    }, 260);
  }

  private lockScroll(): void {
    // `overflow: hidden` on <body> does the locking (see BaseLayout); we only
    // need to remember where the page was so closing restores it.
    this.scrollLockY = window.scrollY;
  }

  private unlockScroll(): void {
    window.scrollTo({ top: this.scrollLockY, behavior: 'auto' });
  }

  private onHashChange = (): void => {
    const id = window.location.hash.replace('#', '');
    if (!id) {
      this.close();
    } else if (this.panels.has(id) && id !== this.openId) {
      this.open(id, null, { updateHash: false });
    }
  };

  private onKeydown = (event: KeyboardEvent): void => {
    if (!this.openId) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key !== 'Tab') return;

    // Focus trap.
    const panel = this.panels.get(this.openId);
    if (!panel) return;

    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (focusables.length === 0) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  dispose(): void {
    document.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('hashchange', this.onHashChange);
  }
}
