import * as THREE from 'three';
import { isActive, onActivityChange } from '../activity';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CameraRig } from './camera-rig';
import { Star, SUN_RADIUS } from './objects/star';
import { Planet } from './objects/planet';
import { Starfield, Nebula } from './objects/space';
import { detectQuality, prefersReducedMotion } from './quality';
import type { QualityProfile, SolarSystemOptions } from './types';

const INTRO_DURATION = 6.4;

/**
 * The scene owner. Public surface is deliberately small: construct it, call
 * `focus`/`release` to drive the camera from UI, and `dispose` on teardown.
 */
export class SolarSystem {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass | null;
  private readonly quality: QualityProfile;

  private readonly star: Star;
  private readonly planets: Planet[] = [];
  private readonly starfield: Starfield;
  private readonly nebula: Nebula | null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(-2, -2);
  /** Own timing rather than THREE.Clock, which is deprecated in r185. */
  private lastFrameMs = 0;
  private elapsedSeconds = 0;
  private readonly options: SolarSystemOptions;
  private readonly reducedMotion: boolean;

  private hoveredId: string | null = null;
  private frameHandle = 0;
  private releaseActivity: (() => void) | null = null;
  /** The reader's intent, as opposed to whether frames are running now. */
  private wantsToRun = false;
  private running = false;
  private disposed = false;
  private reveal = 0;
  private orbitSpeed = 1;
  private pointerInside = false;
  /** Guards against treating a drag/scroll gesture as a click on a planet. */
  private pointerDownAt: { x: number; y: number; time: number } | null = null;

  private resizeObserver: ResizeObserver | null = null;

  constructor(options: SolarSystemOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.quality = detectQuality();
    this.reducedMotion = prefersReducedMotion();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality.tier !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x04040e, 1);

    const { clientWidth, clientHeight } = this.sizeOf();
    this.rig = new CameraRig(clientWidth / clientHeight, this.reducedMotion, clientWidth, clientHeight);

    // --- Scene contents -----------------------------------------------------

    this.starfield = new Starfield(this.quality);
    this.scene.add(this.starfield.points);

    this.nebula = this.quality.nebula ? new Nebula() : null;
    if (this.nebula) this.scene.add(this.nebula.mesh);

    this.star = new Star(this.quality);
    if (options.portraitUrl) this.star.loadPortrait(options.portraitUrl);
    this.scene.add(this.star.group);

    this.scene.add(new THREE.AmbientLight(0x404a80, 0.35));

    options.planets.forEach((config, index) => {
      const planet = new Planet(config, this.quality, index);
      this.planets.push(planet);
      this.scene.add(planet.pivot);
      this.scene.add(planet.orbitLine);
    });

    // --- Post-processing ----------------------------------------------------

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));

    if (this.quality.bloom) {
      const scale = this.quality.bloomResolutionScale;
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(clientWidth * scale, clientHeight * scale),
        0.58, // strength
        0.58, // radius
        0.85 // threshold - only the star and the brightest rims bloom
      );
      this.composer.addPass(this.bloomPass);
    } else {
      this.bloomPass = null;
    }

    // OutputPass applies tone mapping and the sRGB conversion, so every shader
    // above it works in linear space.
    this.composer.addPass(new OutputPass());

    this.resize();
    this.bindEvents();

    // Build every shader program up front. Otherwise the first frame that
    // brings a new material on screen compiles it mid-flight, and the whole
    // main thread stalls for tens of milliseconds, which is exactly what made
    // the entrance stutter.
    this.renderer.compile(this.scene, this.rig.camera);

    this.rig.beginIntro(INTRO_DURATION);
    if (this.reducedMotion) this.reveal = 1;

    this.start();
    // A page opened in a background tab never enters the loop, and an empty
    // canvas when it is brought forward reads as broken. Paint one frame.
    if (!this.running) this.composer.render(0);
    options.onReady();
  }

  // --- Public API ----------------------------------------------------------

  /** Flies to a section. `onArrive` fires once the camera lands. */
  /**
   * Flies to a section. `onArrive` fires once the camera lands.
   *
   * Returns the flight duration in seconds so the caller can size its own
   * safety net, rather than keeping a copy of the longest approach that has to
   * be remembered every time the catalogue changes.
   */
  focus(id: string, onArrive?: () => void): number {
    const planet = this.planets.find((p) => p.config.id === id);
    if (planet) {
      return this.rig.focusOn(() => planet.worldPosition, planet.config.size, onArrive);
    }
    // 'about' is also reachable through the star at the centre.
    if (id === 'about') {
      return this.rig.focusOn(() => new THREE.Vector3(0, 0, 0), SUN_RADIUS, onArrive);
    }
    // Unknown id: don't strand a caller waiting on an arrival that never comes.
    onArrive?.();
    return 0;
  }

  release(): void {
    this.rig.release();
  }

  setOrbitSpeed(multiplier: number): void {
    this.orbitSpeed = multiplier;
  }

  /**
   * Runs the scene, and remembers that it should be running.
   *
   * Kept separate from `resume` so that going idle and coming back cannot
   * override the reader: with the motion switch off, leaving the tab and
   * coming back would otherwise start the scene up again on its own.
   */
  start(): void {
    this.wantsToRun = true;
    this.resume();
  }

  stop(): void {
    this.wantsToRun = false;
    this.suspend();
  }

  private resume(): void {
    if (this.running || this.disposed || !this.wantsToRun || !isActive()) return;
    this.running = true;
    // Reset the frame stamp so a pause doesn't arrive as one huge delta.
    this.lastFrameMs = performance.now();
    this.loop();
  }

  private suspend(): void {
    this.running = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  // --- Internals -----------------------------------------------------------

  private sizeOf(): { clientWidth: number; clientHeight: number } {
    const parent = this.canvas.parentElement;
    return {
      clientWidth: Math.max(parent?.clientWidth ?? window.innerWidth, 1),
      clientHeight: Math.max(parent?.clientHeight ?? window.innerHeight, 1),
    };
  }

  private resize = (): void => {
    const { clientWidth, clientHeight } = this.sizeOf();
    const ratio = Math.min(window.devicePixelRatio, this.quality.pixelRatio);

    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(clientWidth, clientHeight);
    this.bloomPass?.setSize(
      clientWidth * this.quality.bloomResolutionScale,
      clientHeight * this.quality.bloomResolutionScale
    );
    this.starfield.setPixelRatio(ratio);
    this.rig.updateFraming(clientWidth / clientHeight, clientWidth, clientHeight);
  };

  private onPointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    this.pointer.set(nx, ny);
    this.pointerInside = true;
    this.rig.setPointer(nx, ny);
  };

  private onPointerLeave = (): void => {
    this.pointerInside = false;
    this.pointer.set(-2, -2);
    this.rig.setPointer(0, 0);
    this.setHovered(null);
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.pointerDownAt = { x: event.clientX, y: event.clientY, time: performance.now() };
  };

  private onPointerUp = (event: PointerEvent): void => {
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!down) return;

    // Only a short, near-stationary press counts as a click on a body.
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (moved > 12 || performance.now() - down.time > 700) return;

    // Touch devices never fire pointermove first, so resolve the hit here.
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    );

    const hit = this.pick();
    if (hit) this.options.onSelect(hit);
  };

  private bindEvents(): void {
    this.canvas.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.canvas.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
    this.canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    this.canvas.addEventListener('pointerup', this.onPointerUp, { passive: true });
    this.releaseActivity = onActivityChange(this.onActivityChange);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);

    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.canvas.parentElement);
    } else {
      window.addEventListener('resize', this.resize);
    }
  }

  // Goes through resume/suspend, so it never revives a scene the reader
  // switched off at the motion control.
  private onActivityChange = (active: boolean): void => {
    if (active) this.resume();
    else this.suspend();
  };

  private onContextLost = (event: Event): void => {
    // Without preventDefault the context can never be restored; stopping the
    // loop also keeps us from hammering a dead context every frame.
    event.preventDefault();
    this.stop();
  };

  /** Returns the section id under the pointer, or null. */
  private pick(): string | null {
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);

    const targets: THREE.Object3D[] = [this.star.mesh, ...this.planets.map((p) => p.mesh)];
    const hits = this.raycaster.intersectObjects(targets, false);
    const first = hits[0]?.object;

    return (first?.userData.sectionId as string | undefined) ?? null;
  }

  private setHovered(id: string | null): void {
    if (id === this.hoveredId) return;
    this.hoveredId = id;

    this.star.setHovered(id === 'about');
    for (const planet of this.planets) {
      planet.setHovered(planet.config.id === id);
    }

    this.canvas.style.cursor = id ? 'pointer' : '';

    if (!id) {
      this.options.onHoverChange(null);
      return;
    }

    const planet = this.planets.find((p) => p.config.id === id);
    const label = planet?.config.planetLabel ?? 'About Me';
    const screen = this.project(planet ? planet.worldPosition : new THREE.Vector3(0, 0, 0));
    this.options.onHoverChange({ id, label, x: screen.x, y: screen.y });
  }

  /** World position -> CSS pixels within the canvas. */
  private project(world: THREE.Vector3): { x: number; y: number } {
    const projected = world.clone().project(this.rig.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (projected.x * 0.5 + 0.5) * rect.width,
      y: (-projected.y * 0.5 + 0.5) * rect.height,
    };
  }

  private loop = (): void => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.loop);

    // Clamp: a backgrounded tab can hand back a multi-second delta, which would
    // otherwise teleport every planet along its orbit.
    const now = performance.now();
    const delta = Math.min((now - this.lastFrameMs) / 1000, 1 / 20);
    this.lastFrameMs = now;
    this.elapsedSeconds += delta;
    const elapsed = this.elapsedSeconds;

    if (this.reveal < 1) {
      // Slightly faster than the camera move, so the system is fully present
      // before the flight finishes settling.
      this.reveal = Math.min(this.reveal + delta / (INTRO_DURATION * 0.7), 1);
    }

    this.rig.update(delta);
    this.star.update(elapsed, delta, this.rig.camera, this.reveal);
    this.starfield.update(elapsed, delta, this.reveal);
    this.nebula?.update(elapsed, this.reveal);

    // Orbits pause while a section is open so the camera keeps a steady subject.
    const speed = this.rig.isFocused ? this.orbitSpeed * 0.12 : this.orbitSpeed;
    for (const planet of this.planets) {
      planet.update(elapsed, delta, speed, this.reveal);
    }

    if (this.pointerInside && !this.rig.isFocused) {
      this.setHovered(this.pick());
    } else if (this.hoveredId && this.rig.isFocused) {
      this.setHovered(null);
    } else if (this.hoveredId) {
      // Keep the floating label pinned to the planet as it moves.
      const planet = this.planets.find((p) => p.config.id === this.hoveredId);
      const screen = this.project(planet ? planet.worldPosition : new THREE.Vector3(0, 0, 0));
      this.options.onHoverChange({
        id: this.hoveredId,
        label: planet?.config.planetLabel ?? 'About Me',
        x: screen.x,
        y: screen.y,
      });
    }

    this.composer.render(delta);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();

    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.releaseActivity?.();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);

    this.star.dispose();
    this.starfield.dispose();
    this.nebula?.dispose();
    for (const planet of this.planets) planet.dispose();

    this.bloomPass?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}

export { detectQuality, prefersReducedMotion, supportsWebGL } from './quality';
export type { SolarSystemOptions } from './types';
