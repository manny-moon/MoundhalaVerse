import * as THREE from 'three';
import {
  PLANET_VERTEX,
  PLANET_FRAGMENT,
  ATMOSPHERE_VERTEX,
  ATMOSPHERE_FRAGMENT,
  RING_VERTEX,
  RING_FRAGMENT,
} from '../shaders/planet';
import type { PlanetConfig, QualityProfile, SurfaceType } from '../types';

const TYPE_INDEX: Record<SurfaceType, number> = { rocky: 0, ocean: 1, gas: 2, icy: 3 };

/** Deterministic per-planet seed so a given planet looks the same every load. */
function seedFrom(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 100;
}

export class Planet {
  readonly config: PlanetConfig;
  /** Rotates about the system's Y axis; carries the planet around its orbit. */
  readonly pivot = new THREE.Group();
  readonly body = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly orbitLine: THREE.Line;

  private readonly surface: THREE.ShaderMaterial;
  private readonly atmosphere: THREE.ShaderMaterial;
  private readonly orbitMaterial: THREE.LineBasicMaterial;
  private readonly ring: THREE.Mesh | null = null;
  private readonly ringMaterial: THREE.ShaderMaterial | null = null;

  private angle: number;
  private hover = 0;
  private hoverTarget = 0;
  private readonly color: THREE.Color;

  constructor(config: PlanetConfig, quality: QualityProfile, index: number) {
    this.config = config;
    this.color = new THREE.Color(config.color);
    this.angle = (index / 5) * Math.PI * 2;

    const segments = quality.planetSegments;

    this.surface = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERTEX,
      fragmentShader: PLANET_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: this.color.clone() },
        uLightPos: { value: new THREE.Vector3(0, 0, 0) },
        uSeed: { value: seedFrom(config.id) },
        uType: { value: TYPE_INDEX[config.type] },
        uHover: { value: 0 },
        uReveal: { value: 0 },
      },
    });

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(config.size, segments, segments / 2),
      this.surface
    );
    this.mesh.name = config.id;
    this.mesh.userData.sectionId = config.id;
    this.body.add(this.mesh);

    this.atmosphere = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      uniforms: {
        uColor: { value: this.color.clone() },
        uLightPos: { value: new THREE.Vector3(0, 0, 0) },
        uIntensity: { value: config.type === 'gas' ? 0.62 : 0.5 },
        uHover: { value: 0 },
        uReveal: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(config.size * 1.055, segments / 2, segments / 4),
      this.atmosphere
    );
    this.body.add(shell);

    if (config.hasRing) {
      const inner = config.size * 1.5;
      const outer = config.size * 2.6;
      this.ringMaterial = new THREE.ShaderMaterial({
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        uniforms: {
          uColor: { value: this.color.clone().lerp(new THREE.Color('#ffffff'), 0.6) },
          uPlanetCenter: { value: new THREE.Vector3() },
          uLightPos: { value: new THREE.Vector3(0, 0, 0) },
          uInner: { value: inner },
          uOuter: { value: outer },
          uPlanetRadius: { value: config.size },
          uOpacity: { value: 0 },
          uHover: { value: 0 },
        },
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      });
      // Radial segments matter here - the shader bands along the radius.
      this.ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 8), this.ringMaterial);
      this.ring.rotation.x = Math.PI / 2 - 0.28;
      this.body.add(this.ring);
    }

    this.body.rotation.z = config.tilt;
    this.pivot.add(this.body);

    // Orbit path, drawn as a flat ring of line segments in the ecliptic.
    const points: THREE.Vector3[] = [];
    const steps = 180;
    for (let i = 0; i <= steps; i += 1) {
      const theta = (i / steps) * Math.PI * 2;
      points.push(
        new THREE.Vector3(Math.cos(theta) * config.orbitRadius, 0, Math.sin(theta) * config.orbitRadius)
      );
    }
    this.orbitMaterial = new THREE.LineBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.orbitLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), this.orbitMaterial);
  }

  setHovered(hovered: boolean): void {
    this.hoverTarget = hovered ? 1 : 0;
  }

  get worldPosition(): THREE.Vector3 {
    return this.body.getWorldPosition(new THREE.Vector3());
  }

  update(elapsed: number, delta: number, orbitSpeed: number, reveal: number): void {
    // Orbit. `period` is relative; dividing keeps outer planets slower.
    this.angle += (delta * orbitSpeed * 6) / this.config.period;

    this.body.position.set(
      Math.cos(this.angle) * this.config.orbitRadius,
      0,
      Math.sin(this.angle) * this.config.orbitRadius
    );

    // Axial spin, faster for gas giants.
    this.mesh.rotation.y += delta * (this.config.type === 'gas' ? 0.18 : 0.09);

    const rate = 1 - Math.exp(-8 * delta);
    this.hover += (this.hoverTarget - this.hover) * rate;

    this.surface.uniforms.uTime.value = elapsed;
    this.surface.uniforms.uHover.value = this.hover;
    this.surface.uniforms.uReveal.value = reveal;
    this.atmosphere.uniforms.uHover.value = this.hover;
    this.atmosphere.uniforms.uReveal.value = reveal;

    // The sun sits at the origin, so the light direction is just -position.
    const toSun = this.body.position.clone().negate().normalize();
    this.surface.uniforms.uLightPos.value.copy(toSun);
    this.atmosphere.uniforms.uLightPos.value.copy(toSun);

    // Orbit lines brighten on hover so the ring you're about to click is obvious.
    this.orbitMaterial.opacity = (0.12 + this.hover * 0.5) * reveal;

    if (this.ringMaterial) {
      const ringUniforms = this.ringMaterial.uniforms;
      ringUniforms.uOpacity.value = 0.85 * reveal;
      ringUniforms.uHover.value = this.hover;
      ringUniforms.uLightPos.value.copy(toSun);
      this.body.getWorldPosition(ringUniforms.uPlanetCenter.value);
    }

    const scale = 1 + this.hover * 0.09;
    this.body.scale.setScalar(scale);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.surface.dispose();
    this.atmosphere.dispose();
    this.orbitLine.geometry.dispose();
    this.orbitMaterial.dispose();
    this.ring?.geometry.dispose();
    this.ringMaterial?.dispose();
  }
}
