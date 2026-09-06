import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { CameraRig } from '../src/scripts/solar-system/camera-rig.ts';

/**
 * The camera rig is pure maths, so it is driven directly here rather than
 * through a browser. That makes these the fastest and most precise tests in
 * the suite, and they guard the property that is hardest to eyeball: how
 * violently the view swings during a flight.
 */

const DT = 1 / 60;
const PLANET = new THREE.Vector3(17.5, 0, 0);

/** Degrees per second the view direction swings, at its worst, over one flight. */
function flightStats(reducedCameraMotion = false) {
  const rig = new CameraRig(1366 / 768, false, 1366, 768) as any;
  // Start from the resting orbit rather than the intro's far-away position.
  rig.state = 'idle';
  rig.idlePosition(rig.orbitAngle, rig.camera.position);
  rig.setReducedCameraMotion(reducedCameraMotion);

  const seconds: number = rig.focusOn(() => PLANET, 1.9);
  const name: string = rig.approach.name;

  const dir = new THREE.Vector3();
  let prev: THREE.Vector3 | null = null;
  let peakSwing = 0;

  for (let t = 0; t <= seconds + DT; t += DT) {
    rig.update(DT);
    rig.camera.getWorldDirection(dir);
    if (prev) {
      peakSwing = Math.max(peakSwing, THREE.MathUtils.radToDeg(prev.angleTo(dir)) / DT);
    }
    prev = dir.clone();
  }

  return { name, seconds, peakSwing, rig };
}

test('no approach whips the view faster than the agreed budget', () => {
  // 90 deg/s is the line. The set currently tops out at 85.7 and the figure is
  // deterministic per approach, so this is tight on purpose: a looser 100 let a
  // deliberately reintroduced regression sail through when it was tried.
  const worst = new Map<string, number>();
  for (let i = 0; i < 300; i++) {
    const { name, peakSwing } = flightStats();
    worst.set(name, Math.max(worst.get(name) ?? 0, peakSwing));
  }
  expect(worst.size, 'every approach should be reachable').toBeGreaterThanOrEqual(9);
  for (const [name, swing] of worst) {
    expect(swing, `${name} swings the view too fast`).toBeLessThan(90);
  }
});

test('reduce camera motion is calmer than every normal approach', () => {
  let normalBest = Infinity;
  for (let i = 0; i < 120; i++) normalBest = Math.min(normalBest, flightStats(false).peakSwing);

  const calm = flightStats(true);
  expect(calm.name).toBe('calm');
  expect(calm.peakSwing).toBeLessThan(normalBest);
  expect(calm.peakSwing).toBeLessThan(30);
});

test('reduce camera motion always picks the same move', () => {
  const names = new Set<string>();
  const durations = new Set<number>();
  for (let i = 0; i < 30; i++) {
    const { name, seconds } = flightStats(true);
    names.add(name);
    durations.add(seconds);
  }
  expect([...names]).toEqual(['calm']);
  expect(durations.size, 'duration should not vary').toBe(1);
});

test('flights land with the horizon level', () => {
  // Spins are whole turns precisely so a multi-roll arrival is still level.
  // A fractional spin would leave the panel sitting on a tilted world.
  for (let i = 0; i < 60; i++) {
    const { rig, name } = flightStats();
    expect(Math.abs(rig.roll), `${name} left the camera rolled`).toBeLessThan(1e-6);
  }
});

test('the same approach never runs twice in a row', () => {
  const rig = new CameraRig(1366 / 768, false, 1366, 768) as any;
  rig.state = 'idle';
  let previous = '';
  for (let i = 0; i < 200; i++) {
    rig.focusOn(() => PLANET, 1.9);
    const name = rig.approach.name;
    expect(name).not.toBe(previous);
    previous = name;
  }
});

test('reduced motion arrives immediately rather than flying', () => {
  const rig = new CameraRig(1366 / 768, true, 1366, 768) as any;
  const seconds = rig.focusOn(() => PLANET, 1.9);
  expect(seconds).toBeLessThan(0.01);
});
