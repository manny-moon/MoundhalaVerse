import * as THREE from 'three';
import { SUN_VERTEX, SUN_FRAGMENT, CORONA_VERTEX, CORONA_FRAGMENT } from '../shaders/sun';
import type { QualityProfile } from '../types';

export const SUN_RADIUS = 3.3;

export class Star {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly light: THREE.PointLight;

  private readonly surface: THREE.ShaderMaterial;
  private readonly corona: THREE.ShaderMaterial;
  private readonly coronaMesh: THREE.Mesh;
  private portraitTexture: THREE.Texture | null = null;

  private portraitMix = 0;
  private portraitTarget = 0;

  constructor(quality: QualityProfile) {
    this.surface = new THREE.ShaderMaterial({
      vertexShader: SUN_VERTEX,
      fragmentShader: SUN_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uPortraitMix: { value: 0 },
        uPortrait: { value: null },
        uHasPortrait: { value: 0 },
        uReveal: { value: 0 },
      },
    });

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS, quality.sunSegments, quality.sunSegments / 2),
      this.surface
    );
    this.mesh.name = 'sun';
    this.mesh.userData.sectionId = 'about';
    this.group.add(this.mesh);

    // Corona is a camera-facing quad sized well beyond the photosphere.
    this.corona = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERTEX,
      fragmentShader: CORONA_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#ff8a1e') },
        uReveal: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    this.coronaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.corona);
    this.coronaMesh.scale.setScalar(SUN_RADIUS * 8);
    this.coronaMesh.renderOrder = -1;
    this.group.add(this.coronaMesh);

    this.light = new THREE.PointLight('#fff0d8', 3.2, 0, 0.9);
    this.group.add(this.light);
  }

  loadPortrait(url: string): void {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        this.portraitTexture = texture;
        this.surface.uniforms.uPortrait.value = texture;
        this.surface.uniforms.uHasPortrait.value = 1;
      },
      undefined,
      // A missing portrait is cosmetic — the star still renders.
      () => {}
    );
  }

  setHovered(hovered: boolean): void {
    this.portraitTarget = hovered ? 1 : 0;
  }

  update(elapsed: number, delta: number, camera: THREE.Camera, reveal: number): void {
    this.surface.uniforms.uTime.value = elapsed;
    this.corona.uniforms.uTime.value = elapsed;
    this.surface.uniforms.uReveal.value = reveal;
    this.corona.uniforms.uReveal.value = reveal;

    // Ease the portrait crossfade rather than snapping on pointer enter/leave.
    const rate = 1 - Math.exp(-6 * delta);
    this.portraitMix += (this.portraitTarget - this.portraitMix) * rate;
    this.surface.uniforms.uPortraitMix.value = this.portraitMix;

    this.mesh.rotation.y += delta * 0.02;
    this.coronaMesh.quaternion.copy(camera.quaternion);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.coronaMesh.geometry.dispose();
    this.surface.dispose();
    this.corona.dispose();
    this.portraitTexture?.dispose();
  }
}
