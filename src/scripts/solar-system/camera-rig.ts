import * as THREE from 'three';

export type RigState = 'intro' | 'idle' | 'focusing' | 'focused' | 'returning';

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Slow lead-in, long glide out. The arrival reads as settling, not stopping. */
const easeInOutQuint = (t: number): number =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

/**
 * Drives the camera. Three behaviours share one rig:
 *
 *  - a slow idle drift around the system with pointer parallax,
 *  - a tweened flight in to a selected planet and back out again,
 *  - an intro dolly that runs once on load.
 *
 * All of them write to `camera.position` and a look-at target; nothing else in
 * the scene touches the camera.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private state: RigState = 'intro';
  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly lookAt = new THREE.Vector3(0, 0, 0);
  private readonly origin = new THREE.Vector3(0, 0, 0);

  private readonly tweenFrom = new THREE.Vector3();
  private readonly tweenTo = new THREE.Vector3();
  private readonly lookFrom = new THREE.Vector3();
  private readonly lookTo = new THREE.Vector3();
  private tweenElapsed = 0;
  private tweenDuration = 1;

  private orbitAngle = Math.PI * 0.25;
  private pointerX = 0;
  private pointerY = 0;
  private smoothPointerX = 0;
  private smoothPointerY = 0;

  private baseDistance = 46;
  private baseHeight = 15;
  /** The unanimated field of view; focus flights bend `camera.fov` around it. */
  private readonly baseFov = 52;
  private readonly reducedMotion: boolean;

  /** Set while focused so the rig can track a planet that is still orbiting. */
  private focusGetter: (() => THREE.Vector3) | null = null;
  private focusDistance = 6;
  /** Fired once when a focus flight actually lands. Cleared if superseded. */
  private onArrive: (() => void) | null = null;

  constructor(aspect: number, reducedMotion: boolean, width = 1, height = 1) {
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.1, 2000);
    this.camera.fov = this.baseFov;
    this.reducedMotion = reducedMotion;
    this.updateFraming(aspect, width, height);

    if (reducedMotion) {
      // No intro flight - start composed and still.
      this.state = 'idle';
      this.idlePosition(this.orbitAngle, this.camera.position);
    } else {
      // Far out, high above the ecliptic, and swung well off the resting angle
      // so the approach arcs around the system rather than sliding straight in.
      this.camera.position.set(
        Math.sin(this.orbitAngle - 1.5) * this.baseDistance * 2.9,
        this.baseHeight * 6.5,
        Math.cos(this.orbitAngle - 1.5) * this.baseDistance * 2.9
      );
    }
    this.camera.lookAt(this.lookAt);
  }

  /**
   * Pulls the camera back on narrow viewports so the outer orbit still fits,
   * and shifts the subject clear of the copy.
   *
   * The shift is a projection offset rather than a moved look-at target: the
   * camera drifts around the system continuously, so anything expressed in
   * world space would swing across the screen as it orbits. A frustum offset
   * is stable no matter where the camera happens to be.
   */
  updateFraming(aspect: number, width = 1, height = 1): void {
    const systemRadius = 30;
    const vFov = THREE.MathUtils.degToRad(this.baseFov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fitDistance = systemRadius / Math.tan(Math.min(vFov, hFov) / 2);

    this.baseDistance = THREE.MathUtils.clamp(fitDistance * 0.92, 40, 130);
    this.baseHeight = this.baseDistance * 0.32;
    this.camera.aspect = aspect;

    // Negative offsets move the subject right / down.
    const portrait = aspect < 1.05;
    const offsetX = portrait ? 0 : -width * 0.17;
    const offsetY = portrait ? -height * 0.16 : 0;

    this.camera.setViewOffset(width, height, offsetX, offsetY, width, height);
    this.camera.updateProjectionMatrix();
  }

  setPointer(nx: number, ny: number): void {
    this.pointerX = nx;
    this.pointerY = ny;
  }

  beginIntro(duration: number): void {
    if (this.reducedMotion) {
      this.state = 'idle';
      return;
    }
    this.state = 'intro';
    this.tweenElapsed = 0;
    this.tweenDuration = duration;
    this.tweenFrom.copy(this.camera.position);
    this.idlePosition(this.orbitAngle, this.tweenTo);
    this.lookFrom.copy(this.lookAt);
    this.lookTo.copy(this.origin);
  }

  focusOn(getPosition: () => THREE.Vector3, planetRadius: number, onArrive?: () => void): void {
    this.focusGetter = getPosition;
    this.focusDistance = Math.max(planetRadius * 4.5, 6.5);
    this.onArrive = onArrive ?? null;

    this.state = 'focusing';
    this.tweenElapsed = 0;
    this.tweenDuration = this.reducedMotion ? 0.001 : 1.9;
    this.tweenFrom.copy(this.camera.position);
    this.lookFrom.copy(this.lookAt);

    const planet = getPosition();
    this.focusTarget(planet, this.tweenTo);
    this.lookTo.copy(planet);
  }

  release(): void {
    if (this.state === 'idle' || this.state === 'intro') return;

    this.state = 'returning';
    this.tweenElapsed = 0;
    this.tweenDuration = this.reducedMotion ? 0.001 : 1.25;
    this.tweenFrom.copy(this.camera.position);
    this.lookFrom.copy(this.lookAt);
    this.idlePosition(this.orbitAngle, this.tweenTo);
    this.lookTo.copy(this.origin);
    this.focusGetter = null;
    // Pulling out cancels any panel that was waiting on the flight.
    this.onArrive = null;
  }

  get isFocused(): boolean {
    return this.state === 'focused' || this.state === 'focusing';
  }

  /** Camera sits outside the planet, swung off-axis so the sun rakes across it. */
  private focusTarget(planet: THREE.Vector3, out: THREE.Vector3): void {
    const outward = planet.clone().normalize();
    const side = new THREE.Vector3(-outward.z, 0, outward.x);
    out
      .copy(planet)
      .addScaledVector(outward, this.focusDistance)
      .addScaledVector(side, this.focusDistance * 0.55);
    out.y += this.focusDistance * 0.42;
  }

  private idlePosition(driftAngle: number, out: THREE.Vector3): void {
    out.set(
      Math.sin(driftAngle) * this.baseDistance,
      this.baseHeight,
      Math.cos(driftAngle) * this.baseDistance
    );
  }

  private applyIdle(delta: number): void {
    if (!this.reducedMotion) {
      this.orbitAngle += delta * 0.028;
    }

    this.idlePosition(this.orbitAngle, this.target);

    // Pointer parallax, eased. Kept small - it should feel like a held camera,
    // not a joystick.
    const rate = 1 - Math.exp(-3.5 * delta);
    this.smoothPointerX += (this.pointerX - this.smoothPointerX) * rate;
    this.smoothPointerY += (this.pointerY - this.smoothPointerY) * rate;

    if (!this.reducedMotion) {
      const sway = this.baseDistance * 0.11;
      this.target.x += this.smoothPointerX * sway;
      this.target.y += -this.smoothPointerY * sway * 0.75;
    }

    const follow = 1 - Math.exp(-2.2 * delta);
    this.camera.position.lerp(this.target, follow);
    this.lookAt.lerp(this.origin, follow);
  }

  update(delta: number): void {
    switch (this.state) {
      case 'intro': {
        this.tweenElapsed += delta;
        const t = Math.min(this.tweenElapsed / this.tweenDuration, 1);
        const eased = easeInOutQuint(t);

        // The resting angle keeps advancing through the intro, so the camera
        // arcs around the system on its way down instead of dropping straight
        // toward a fixed mark.
        this.orbitAngle += delta * 0.16;
        this.idlePosition(this.orbitAngle, this.tweenTo);

        this.camera.position.lerpVectors(this.tweenFrom, this.tweenTo, eased);
        this.lookAt.lerpVectors(this.lookFrom, this.lookTo, eased);

        if (t >= 1) this.state = 'idle';
        break;
      }

      case 'idle': {
        this.applyIdle(delta);
        break;
      }

      case 'focusing':
      case 'returning': {
        this.tweenElapsed += delta;
        const t = Math.min(this.tweenElapsed / this.tweenDuration, 1);
        const eased = easeInOutCubic(t);

        // Re-aim at the live planet position - it keeps orbiting mid-flight.
        if (this.state === 'focusing' && this.focusGetter) {
          const planet = this.focusGetter();
          this.focusTarget(planet, this.tweenTo);
          this.lookTo.copy(planet);
        }

        this.camera.position.lerpVectors(this.tweenFrom, this.tweenTo, eased);
        this.lookAt.lerpVectors(this.lookFrom, this.lookTo, eased);

        // Bow the path so the camera swings over the system rather than
        // sliding through it in a straight line. Zero at both ends.
        const bow = Math.sin(eased * Math.PI);
        this.camera.position.y += bow * this.baseDistance * 0.22;

        // Squeeze the field of view through the middle of the move and release
        // it on arrival. Reads as a lens settling onto a subject.
        const targetFov = this.baseFov - 7 * bow;
        if (Math.abs(this.camera.fov - targetFov) > 0.01) {
          this.camera.fov = targetFov;
          this.camera.updateProjectionMatrix();
        }

        if (t >= 1) {
          if (this.state === 'focusing') {
            this.state = 'focused';
            // Hand off exactly once; the callback may start a new flight.
            const arrived = this.onArrive;
            this.onArrive = null;
            arrived?.();
          } else {
            this.state = 'idle';
            // Resume the drift from wherever the return actually landed.
            this.orbitAngle = Math.atan2(this.camera.position.x, this.camera.position.z);
          }
        }
        break;
      }

      case 'focused': {
        // Stay locked on as the planet continues along its orbit.
        if (this.focusGetter) {
          const planet = this.focusGetter();
          this.focusTarget(planet, this.target);
          const rate = 1 - Math.exp(-4 * delta);
          this.camera.position.lerp(this.target, rate);
          this.lookAt.lerp(planet, rate);
        }
        break;
      }
    }

    this.camera.lookAt(this.lookAt);
  }
}
