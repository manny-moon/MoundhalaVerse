import { isActive, onActivityChange, whenActive } from './activity';
import { ModalController } from './modals';
import { Typewriter } from './typewriter';
import { supportsWebGL, prefersReducedMotion } from './solar-system/quality';
import type { SolarSystem } from './solar-system';
import type { PlanetConfig } from './solar-system/types';

interface BootConfig {
  planets: readonly PlanetConfig[];
  phrases: readonly string[];
  portraitUrl: string;
}

const $ = <T extends HTMLElement>(selector: string): T | null =>
  document.querySelector<T>(selector);

export function boot(config: BootConfig): void {
  const scrim = $('#scrim');
  if (!scrim) return;

  let system: SolarSystem | null = null;

  // --- Idle -----------------------------------------------------------------
  //
  // One flag drives every CSS animation on the page, so the entrance, the
  // orbiting rail dot and the caret all hold together while the reader is in
  // another window. The scene loop and the typewriter watch the same signal
  // themselves; this only covers what CSS owns.
  const markActivity = (active: boolean): void => {
    if (active) delete document.body.dataset.active;
    else document.body.dataset.active = 'false';
  };
  markActivity(isActive());
  onActivityChange(markActivity);

  // --- Navigation -----------------------------------------------------------
  //
  // Declared before the modal controller: opening a panel calls back into
  // setActiveNav, and a page loaded with a section hash opens one immediately.

  const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-nav]'));

  function setActiveNav(id: string | null): void {
    for (const button of navButtons) {
      button.setAttribute('aria-current', button.dataset.nav === id ? 'true' : 'false');
    }
  }

  // Selecting a section flies the camera to its planet and only then reveals
  // the panel. `sequencing` marks the opens that already did their flight, so
  // the onOpen hook doesn't start a second one.
  let sequencing = false;
  let pendingToken = 0;
  let pendingTimer = 0;

  const modals = new ModalController(document, scrim, {
    onRequest: (id, trigger) => requestSection(id, trigger),
    onOpen: (id) => {
      setActiveNav(id);
      // Opens that bypassed requestSection - hash routing, browser back and
      // forward - still need the camera moved.
      if (!sequencing) system?.focus(id);
    },
    onClose: () => {
      pendingToken += 1; // strand any in-flight reveal
      window.clearTimeout(pendingTimer);
      system?.release();
      setActiveNav(null);
    },
  });

  function requestSection(id: string, trigger: HTMLElement | null = null): void {
    if (modals.current === id) return;

    // Light up the nav immediately so the click registers during the flight.
    setActiveNav(id);

    if (!system) {
      modals.open(id, trigger);
      return;
    }

    const token = (pendingToken += 1);
    window.clearTimeout(pendingTimer);

    const reveal = (): void => {
      if (token !== pendingToken) return; // a newer selection took over
      window.clearTimeout(pendingTimer);
      sequencing = true;
      modals.open(id, trigger);
      sequencing = false;
    };

    // Safety net: the render loop is paused while the tab is hidden, so the
    // arrival callback can be arbitrarily late. Never strand the panel behind
    // an animation that may not be running.
    //
    // Sized from the flight that actually started. It used to be a hardcoded
    // figure that had to be raised by hand every time a longer approach was
    // added, and firing early opens the panel mid-flight.
    //
    // Double the flight, because the render loop clamps delta to 1/20s: below
    // 20fps the camera's own clock runs slower than the wall clock, and a
    // 4.6-second approach can take twice that in real time on a slow device.
    // The arrival callback is the real path; this only has to never strand.
    const flightSeconds = system.focus(id, reveal);
    pendingTimer = window.setTimeout(
      () => whenActive(reveal),
      flightSeconds * 2000 + 1500
    );
  }

  function cancelPending(): void {
    pendingToken += 1;
    window.clearTimeout(pendingTimer);
  }

  // --- Headline -------------------------------------------------------------
  //
  // Typing waits for the entrance to finish. Rather than duplicating the CSS
  // timings here, it listens for the last element in the choreography to
  // finish animating, so the stylesheet stays the single source of truth.

  /** Leading phrases that always play in order, the greeting. */
  const ORDERED_PREFIX = 2;

  const title = $('#headline');
  if (title) {
    const typewriter = new Typewriter(title, {
      phrases: config.phrases,
      orderedPrefix: ORDERED_PREFIX,
    });

    if (prefersReducedMotion()) {
      typewriter.renderStatic();
    } else {
      // Blank the server-rendered text so the caret waits on an empty line
      // instead of showing the greeting and then retyping it.
      typewriter.clear();

      let started = false;
      const beginTyping = (): void => {
        if (started) return;
        started = true;
        typewriter.start();
      };

      // `.settings` is the last thing to arrive. If it never animates, because
      // there is no such element or the entrance was skipped, the timer still fires.
      const last = $('#settings-toggle')?.closest('.settings') ?? null;
      last?.addEventListener('animationend', beginTyping, { once: true });
      // Paused animations never reach `animationend`, but a timer does not
      // pause. Without the activity gate a blurred page would start typing
      // behind an entrance that is still frozen mid-flight.
      window.setTimeout(() => whenActive(beginTyping), 6000);
    }
  }

  // --- Settings -------------------------------------------------------------

  const settingsToggle = $<HTMLButtonElement>('#settings-toggle');
  const settingsPanel = $('#settings-panel');

  if (settingsToggle && settingsPanel) {
    const setOpen = (open: boolean): void => {
      settingsPanel.classList.toggle('is-open', open);
      settingsPanel.hidden = !open;
      settingsToggle.setAttribute('aria-expanded', String(open));
    };

    settingsToggle.addEventListener('click', () => {
      const isOpen = settingsToggle.getAttribute('aria-expanded') === 'true';
      setOpen(!isOpen);
    });

    document.addEventListener('click', (event) => {
      const target = event.target as Node;
      if (settingsPanel.hidden) return;
      if (settingsPanel.contains(target) || settingsToggle.contains(target)) return;
      setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !settingsPanel.hidden && !modals.current) {
        setOpen(false);
        settingsToggle.focus();
      }
    });
  }

  const speedControl = $<HTMLInputElement>('#orbit-speed');
  const speedValue = $('#orbit-speed-value');

  const applySpeed = (raw: string): void => {
    const multiplier = Number(raw) / 100;
    system?.setOrbitSpeed(multiplier);
    if (speedValue) speedValue.textContent = `${multiplier.toFixed(1)}×`;
  };

  speedControl?.addEventListener('input', (event) => {
    applySpeed((event.target as HTMLInputElement).value);
  });

  const motionToggle = $<HTMLInputElement>('#motion-toggle');
  motionToggle?.addEventListener('change', () => {
    if (motionToggle.checked) system?.start();
    else system?.stop();
  });

  // --- WebGL scene ----------------------------------------------------------

  const canvas = $<HTMLCanvasElement>('#scene');
  const stage = $('#stage');
  const hoverLabel = $('#hover-label');

  /**
   * Releases the entrance animations. Every path has to reach this, because the copy
   * starts at opacity 0, so failing to call it would leave the page blank.
   * Idempotent, and backed by a timeout below.
   */
  let released = false;
  function markReady(): void {
    if (released) return;
    released = true;
    document.body.dataset.stage = 'ready';
  }

  // Backstop: however the scene goes, the content appears.
  window.setTimeout(markReady, 3000);

  if (!canvas || !stage) {
    markReady();
    return;
  }

  if (!supportsWebGL()) {
    // Content is server-rendered and fully reachable without the scene; just
    // drop the canvas and let the static backdrop show.
    stage.dataset.mode = 'fallback';
    canvas.remove();
    markReady();
    return;
  }

  // Defer the three.js chunk until the shell has painted.
  const startScene = async (): Promise<void> => {
    try {
      const { SolarSystem } = await import('./solar-system');

      system = new SolarSystem({
        canvas,
        planets: config.planets,
        portraitUrl: config.portraitUrl,
        onSelect: (id) => requestSection(id),
        onHoverChange: (hover) => {
          if (!hoverLabel) return;
          if (!hover) {
            hoverLabel.hidden = true;
            return;
          }
          hoverLabel.hidden = false;
          hoverLabel.textContent = hover.label;
          hoverLabel.style.transform = `translate3d(${hover.x}px, ${hover.y}px, 0) translate(-50%, -170%)`;
        },
        onReady: () => {
          stage.dataset.mode = 'ready';
          if (speedControl) applySpeed(speedControl.value);
          // Shaders are compiled by this point, so the main thread is free for
          // the entrance to run smoothly.
          markReady();
        },
      });

      // A section opened from the URL hash did so before the scene existed;
      // move the camera to it now.
      if (modals.current) system.focus(modals.current);
    } catch {
      stage.dataset.mode = 'fallback';
      canvas.remove();
      markReady();
    }
  };

  // Safe to run now that navigation, settings and the scene loader are wired.
  modals.openFromHash();

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => void startScene(), { timeout: 1200 });
  } else {
    window.setTimeout(() => void startScene(), 120);
  }

  // --- Keyboard navigation of the scene -------------------------------------
  //
  // The canvas itself is inert to assistive tech; these shortcuts mirror the
  // nav buttons so the 3D view is operable without a pointer.

  const order = config.planets.map((p) => p.id);
  let cursor = -1;

  document.addEventListener('keydown', (event) => {
    if (modals.current) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        cursor = (cursor + 1) % order.length;
        focusPlanet(order[cursor]!);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        cursor = (cursor - 1 + order.length) % order.length;
        focusPlanet(order[cursor]!);
        break;
      case 'Enter':
        if (cursor >= 0) {
          event.preventDefault();
          requestSection(order[cursor]!);
        }
        break;
      case 'Escape':
        // No panel is open yet, so this aborts a flight in progress.
        cancelPending();
        system?.release();
        setActiveNav(null);
        break;
      default:
        break;
    }
  });

  function focusPlanet(id: string): void {
    system?.focus(id);
    setActiveNav(id);
    const button = navButtons.find((b) => b.dataset.nav === id);
    button?.focus({ preventScroll: true });
  }
}
