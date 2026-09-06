import * as THREE from 'three';

export type RigState = 'intro' | 'idle' | 'focusing' | 'focused' | 'returning';

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Flat at both ends, so blending with it introduces no acceleration step. */
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * How the camera flies in to a planet.
 *
 * One is picked at random per selection, never the same twice running, so
 * revisiting a section doesn't replay the identical move.
 */
interface Approach {
  readonly name: string;
  /** Arc height through the middle of the move, times baseDistance. Negative swings underneath. */
  readonly bow: number;
  /** Lateral offset of the arrival point, times focusDistance. */
  readonly side: number;
  /** Vertical offset of the arrival point, times focusDistance. Negative arrives from below. */
  readonly lift: number;
  /** Peak roll through the middle of the move, radians. Unwinds to level on arrival. */
  readonly roll: number;
  /** Peak field-of-view squeeze, degrees. */
  readonly fov: number;
  /** Seconds. */
  readonly duration: number;
  /**
   * Complete camera rolls over the move, on top of `roll`.
   *
   * Whole turns are the trick that makes this safe: a rotation of exactly
   * n * 2pi is the identity, so the camera can barrel round three times and
   * still arrive with the horizon dead level. Fractional values would land
   * tilted and are deliberately not used.
   */
  readonly spins?: number;
  /** Complete loops of a corkscrew around the flight path. 0 stays planar. */
  readonly helix?: number;
  /** Radius of that corkscrew, times baseDistance. Fades to nothing at both ends. */
  readonly helixAmp?: number;
}

/** The parts of an approach the flight loop reads, shared by both directions. */
type FlightShape = Pick<Approach, 'bow' | 'roll' | 'fov' | 'spins' | 'helix' | 'helixAmp'>;

/** The way back out; kept plain so the flair reads as belonging to arrivals. */
const RETURN_SHAPE: FlightShape = { bow: 0.18, roll: 0, fov: 6 };

/** The original five. Planar arcs, at most a partial bank. */
const CLASSIC_APPROACHES: readonly Approach[] = [
  // Swings up and over, settling from above.
  { name: 'arc-over',   bow:  0.22, side:  0.55, lift:  0.42, roll:  0.0,  fov:  7, duration: 1.9 },
  // Drops beneath the ecliptic and rises onto the planet from underneath.
  { name: 'from-under', bow: -0.30, side:  0.40, lift: -0.52, roll:  0.10, fov:  6, duration: 2.35 },
  // Banks hard through the middle, rolling the horizon over before levelling.
  { name: 'barrel',     bow:  0.12, side:  0.80, lift:  0.30, roll:  0.55, fov:  9, duration: 2.15 },
  // Loops around to the far side and comes back in.
  { name: 'wide-swing', bow:  0.18, side: -0.75, lift:  0.28, roll: -0.28, fov:  8, duration: 2.85 },
  // Steep and fast, with the hardest lens squeeze.
  { name: 'dive',       bow:  0.36, side:  0.18, lift:  0.85, roll:  0.16, fov: 11, duration: 1.8 },
];

/** The showier set: corkscrew paths and multi-turn rolls. */
const AERIAL_APPROACHES: readonly Approach[] = [
  // The long one. Five and a half seconds and two unhurried rolls, with the
  // path itself corkscrewing once around the line to the planet and the lens
  // squeezing hard through the middle. The drama is meant to come from the
  // length and the path, not from spinning quickly.
  {
    name: 'corkscrew',
    bow: 0.30, side: 0.65, lift: 0.35, roll: 0, fov: 15, duration: 5.5,
    spins: 2, helix: 1, helixAmp: 0.26,
  },
  // Swings wide past the far side, then curves back in with a single roll.
  {
    name: 'slingshot',
    bow: 0.22, side: -0.95, lift: 0.18, roll: 0, fov: 12, duration: 4.3,
    spins: -1, helix: 1, helixAmp: 0.16,
  },
  // Falls from high above, turning over once, and brakes hard on arrival.
  {
    name: 'tumble',
    bow: 0.55, side: 0.10, lift: 0.95, roll: 0, fov: 13, duration: 3.4,
    spins: 1, helix: 0, helixAmp: 0,
  },
  // Comes in low and flat under the ecliptic, spiralling up onto the planet.
  // No roll at all here: the corkscrewing path supplies the motion.
  {
    name: 'spiral-up',
    bow: -0.34, side: 0.8, lift: -0.55, roll: 0.3, fov: 10, duration: 4.2,
    spins: 0, helix: 1.5, helixAmp: 0.13,
  },
];

/** Nine in the pool. One is picked at random per selection, never twice running. */
const APPROACHES: readonly Approach[] = [...CLASSIC_APPROACHES, ...AERIAL_APPROACHES];


/** Scratch vectors for the helix frame; reused so the loop allocates nothing. */
const HELIX_DIR = new THREE.Vector3();
const HELIX_SIDE = new THREE.Vector3();
const HELIX_UP = new THREE.Vector3();

/** Angular drift of the camera while idling, radians per second. */
const IDLE_SWEEP = 0.028;
/** Faster arc during the intro, eased down to IDLE_SWEEP before it ends. */
const INTRO_SWEEP = 0.16;

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

  private approach: Approach = APPROACHES[0]!;
  private approachIndex = -1;
  /** Camera roll, applied after lookAt since lookAt would otherwise clear it. */
  private roll = 0;

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
    const portrait = aspect < 1.05;

    // Fitting the whole system across a phone's short axis pushes the camera
    // back more than twice as far as on a desktop, because the horizontal
    // field of view is the narrow one there. The scene ended up a speck in the
    // lower third. On portrait the outermost orbit is allowed to cross the
    // edges instead, which frames the star and the inner planets at a size
    // worth looking at. The rail, not the planets, is the nav on a phone.
    const systemRadius = portrait ? 23 : 30;
    const vFov = THREE.MathUtils.degToRad(this.baseFov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fitDistance = systemRadius / Math.tan(Math.min(vFov, hFov) / 2);

    this.baseDistance = THREE.MathUtils.clamp(fitDistance * 0.92, 40, 130);
    this.baseHeight = this.baseDistance * 0.32;
    this.camera.aspect = aspect;

    // Negative offsets move the subject right / down.
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

  /** Random, but never the move that just played. */
  private pickApproach(): Approach {
    if (APPROACHES.length < 2) return APPROACHES[0]!;
    let i = this.approachIndex;
    while (i === this.approachIndex) i = Math.floor(Math.random() * APPROACHES.length);
    this.approachIndex = i;
    return APPROACHES[i]!;
  }

  /** Starts a flight and returns its duration in seconds. */
  focusOn(getPosition: () => THREE.Vector3, planetRadius: number, onArrive?: () => void): number {
    this.focusGetter = getPosition;
    this.focusDistance = Math.max(planetRadius * 4.5, 6.5);
    this.onArrive = onArrive ?? null;
    this.approach = this.pickApproach();

    this.state = 'focusing';
    this.tweenElapsed = 0;
    this.tweenDuration = this.reducedMotion ? 0.001 : this.approach.duration;
    this.tweenFrom.copy(this.camera.position);
    this.lookFrom.copy(this.lookAt);

    const planet = getPosition();
    this.focusTarget(planet, this.tweenTo);
    this.lookTo.copy(planet);

    return this.tweenDuration;
  }

  /** Starts the way back out and returns its duration in seconds; 0 if already out. */
  release(): number {
    if (this.state === 'idle' || this.state === 'intro') return 0;

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

    return this.tweenDuration;
  }

  get isFocused(): boolean {
    return this.state === 'focused' || this.state === 'focusing';
  }

  /** Camera sits outside the planet, offset per the chosen approach. */
  private focusTarget(planet: THREE.Vector3, out: THREE.Vector3): void {
    const outward = planet.clone().normalize();
    const side = new THREE.Vector3(-outward.z, 0, outward.x);
    out
      .copy(planet)
      .addScaledVector(outward, this.focusDistance)
      .addScaledVector(side, this.focusDistance * this.approach.side);
    out.y += this.focusDistance * this.approach.lift;
  }

  private idlePosition(driftAngle: number, out: THREE.Vector3): void {
    out.set(
      Math.sin(driftAngle) * this.baseDistance,
      this.baseHeight,
      Math.cos(driftAngle) * this.baseDistance
    );
  }

  /** Advances the damped pointer parallax. Runs in every drifting state. */
  private updatePointer(delta: number): void {
    const rate = 1 - Math.exp(-2.4 * delta);
    this.smoothPointerX += (this.pointerX - this.smoothPointerX) * rate;
    this.smoothPointerY += (this.pointerY - this.smoothPointerY) * rate;
  }

  /**
   * Where the idle drift wants the camera right now.
   *
   * `swayWeight` fades the pointer parallax in, which lets the intro and the
   * return-from-focus converge on the exact position idle will ask for. Idle
   * used to be the only state applying sway, so taking over meant a target
   * that jumped by the full parallax offset in a single frame.
   */
  private idleTarget(out: THREE.Vector3, swayWeight: number): void {
    this.idlePosition(this.orbitAngle, out);
    if (this.reducedMotion) return;

    // Kept small - it should feel like a held camera, not a joystick.
    const sway = this.baseDistance * 0.11 * swayWeight;
    out.x += this.smoothPointerX * sway;
    out.y += -this.smoothPointerY * sway * 0.75;
  }

  private applyIdle(delta: number): void {
    this.roll = 0;
    if (!this.reducedMotion) {
      this.orbitAngle += delta * IDLE_SWEEP;
    }

    this.updatePointer(delta);
    this.idleTarget(this.target, 1);

    // Set outright rather than easing toward it. The drift is smooth and the
    // parallax is already damped, so a second filter only adds lag, and lag
    // that appears the instant idle takes over reads as a hitch.
    this.camera.position.copy(this.target);
    this.lookAt.copy(this.origin);
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
        //
        // The rate eases down to the idle drift as it goes. Holding the intro
        // rate to the last frame meant the camera was still sweeping 5.7x
        // faster than idle when the state flipped, and that speed step was the
        // jolt at the handoff. smoothstep is flat at t = 1, so the
        // acceleration matches at the boundary too, not just the speed.
        if (!this.reducedMotion) {
          const sweep = INTRO_SWEEP + (IDLE_SWEEP - INTRO_SWEEP) * smoothstep(t);
          this.orbitAngle += delta * sweep;
        }

        // Aim at the position idle will ask for, sway included, so there is
        // nothing left to correct when it takes over.
        this.updatePointer(delta);
        this.idleTarget(this.tweenTo, eased);

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
        } else if (this.state === 'returning') {
          // Same convergence the intro does: keep the drift running and aim at
          // the live idle target, sway faded in, so idle inherits the camera
          // exactly where it already is.
          this.updatePointer(delta);
          if (!this.reducedMotion) this.orbitAngle += delta * IDLE_SWEEP;
          this.idleTarget(this.tweenTo, eased);
        }

        this.camera.position.lerpVectors(this.tweenFrom, this.tweenTo, eased);
        this.lookAt.lerpVectors(this.lookFrom, this.lookTo, eased);

        // Bow the path so the camera travels an arc rather than a straight
        // line. Zero at both ends, so it never disturbs the endpoints.
        // A negative bow swings the move underneath the system instead.
        const bow = Math.sin(eased * Math.PI);
        const flight = this.state === 'focusing' ? this.approach : RETURN_SHAPE;
        this.camera.position.y += bow * this.baseDistance * flight.bow;

        // Corkscrew the path around the straight line between the endpoints.
        // The amplitude rides on `bow`, so it is zero at both ends and cannot
        // disturb where the move starts or lands.
        const helix = flight.helix ?? 0;
        if (helix !== 0) {
          const amp = (flight.helixAmp ?? 0.25) * this.baseDistance * bow;
          // Phase runs on raw `t`, not the eased progress. Easing it made the
          // corkscrew spin fastest at exactly the moment the camera was already
          // travelling fastest, and the two compounded into a whip through the
          // middle of the move. At a constant rate the loops read the same and
          // the peak comes down sharply.
          const phase = t * Math.PI * 2 * helix;
          HELIX_DIR.subVectors(this.tweenTo, this.tweenFrom);
          if (HELIX_DIR.lengthSq() > 1e-6) {
            HELIX_DIR.normalize();
            // A frame perpendicular to travel. Falls back to world X when the
            // path is near-vertical and the horizontal component vanishes.
            HELIX_SIDE.set(-HELIX_DIR.z, 0, HELIX_DIR.x);
            if (HELIX_SIDE.lengthSq() < 1e-6) HELIX_SIDE.set(1, 0, 0);
            HELIX_SIDE.normalize();
            HELIX_UP.crossVectors(HELIX_DIR, HELIX_SIDE).normalize();
            this.camera.position.addScaledVector(HELIX_SIDE, Math.cos(phase) * amp);
            this.camera.position.addScaledVector(HELIX_UP, Math.sin(phase) * amp);
          }
        }

        // Roll unwinds to level by the time it arrives, so the horizon is
        // always straight once the panel is up. Full turns are added on top:
        // n * 2pi is the identity, so a two-roll arrival is still level.
        //
        // smoothstep, not an ease-out. An ease-out front-loads the rotation,
        // which put the peak rate at the very start and made the move read as
        // a whip rather than a roll. smoothstep begins and ends at a standstill
        // and peaks at only 1.5x the average rate, in the middle where the
        // camera is already travelling fastest.
        const spins = flight.spins ?? 0;
        const spinCurve = spins === 0 ? 0 : smoothstep(t);
        this.roll = flight.roll * bow + spins * Math.PI * 2 * spinCurve;

        // Squeeze the field of view through the middle of the move and release
        // it on arrival. Reads as a lens settling onto a subject.
        const targetFov = this.baseFov - flight.fov * bow;
        if (Math.abs(this.camera.fov - targetFov) > 0.01) {
          this.camera.fov = targetFov;
          this.camera.updateProjectionMatrix();
        }

        if (t >= 1) {
          if (this.state === 'focusing') {
            this.state = 'focused';
            // Whole turns are visually level, so drop the value rather than
            // re-applying an identity rotation on every focused frame.
            this.roll = 0;
            // Hand off exactly once; the callback may start a new flight.
            const arrived = this.onArrive;
            this.onArrive = null;
            arrived?.();
          } else {
            // orbitAngle has been advancing throughout the return, so the
            // drift simply carries on; nothing to re-derive from the position.
            this.state = 'idle';
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

    // lookAt rebuilds the orientation from scratch, so any roll has to be
    // re-applied on top of it rather than folded into the target.
    if (this.roll !== 0) this.camera.rotateZ(this.roll);
  }
}
