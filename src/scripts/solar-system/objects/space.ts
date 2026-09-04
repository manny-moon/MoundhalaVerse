import * as THREE from 'three';
import {
  STARFIELD_VERTEX,
  STARFIELD_FRAGMENT,
  NEBULA_VERTEX,
  NEBULA_FRAGMENT,
} from '../shaders/space';
import type { QualityProfile } from '../types';

/** Colours sampled across the stellar classification range, O through M. */
const STAR_COLORS = [
  new THREE.Color('#9bb7ff'),
  new THREE.Color('#c8d8ff'),
  new THREE.Color('#ffffff'),
  new THREE.Color('#fff4e8'),
  new THREE.Color('#ffd9a8'),
  new THREE.Color('#ffb27a'),
];

export class Starfield {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor(quality: QualityProfile) {
    const count = quality.starCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      // Distribute on a spherical shell with jittered radius so the field has depth.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 120 + Math.random() * 320;

      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[i * 3 + 1] = Math.cos(phi) * radius;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

      const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]!;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      // Heavily skewed: a few bright anchors, mostly faint dust.
      sizes[i] = 0.5 + Math.pow(Math.random(), 5) * 5.5;
      phases[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: STARFIELD_VERTEX,
      fragmentShader: STARFIELD_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: quality.pixelRatio },
        uReveal: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  update(elapsed: number, delta: number, reveal: number): void {
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uReveal.value = reveal;
    // Barely-there drift; enough that the field never feels like a static texture.
    this.points.rotation.y += delta * 0.004;
  }

  setPixelRatio(ratio: number): void {
    this.material.uniforms.uPixelRatio.value = ratio;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

export class Nebula {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color('#2a1d6b') },
        uColorB: { value: new THREE.Color('#0d4a6b') },
        uReveal: { value: 0 },
      },
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(460, 32, 24), this.material);
    this.mesh.renderOrder = -2;
    this.mesh.frustumCulled = false;
  }

  update(elapsed: number, reveal: number): void {
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uReveal.value = reveal;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
