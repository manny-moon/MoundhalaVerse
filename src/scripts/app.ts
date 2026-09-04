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

  const modals = new ModalController(document, scrim, {
    onOpen: (id) => {
      system?.focus(id);
      setActiveNav(id);
    },
    onClose: () => {
      system?.release();
      setActiveNav(null);
    },
  });

  // --- Headline -------------------------------------------------------------

  const title = $('#headline');
  if (title) {
    const typewriter = new Typewriter(title, { phrases: config.phrases });
    if (prefersReducedMotion()) typewriter.renderStatic();
    else typewriter.start();
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

  if (!canvas || !stage) return;

  if (!supportsWebGL()) {
    // Content is server-rendered and fully reachable without the scene; just
    // drop the canvas and let the static backdrop show.
    stage.dataset.mode = 'fallback';
    canvas.remove();
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
        onSelect: (id) => modals.open(id),
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
        },
      });

      // A section opened from the URL hash did so before the scene existed;
      // move the camera to it now.
      if (modals.current) system.focus(modals.current);
    } catch {
      stage.dataset.mode = 'fallback';
      canvas.remove();
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
          modals.open(order[cursor]!);
        }
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
