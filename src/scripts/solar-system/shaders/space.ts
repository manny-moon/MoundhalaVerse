import { NOISE_GLSL } from './noise';

/**
 * Deep-space backdrop: a starfield of GPU-twinkled points and a very low
 * frequency nebula painted on the inside of a large sphere.
 */

export const STARFIELD_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3  aColor;

uniform float uTime;
uniform float uPixelRatio;
uniform float uReveal;

varying vec3  vColor;
varying float vTwinkle;

void main() {
  vColor = aColor;

  // Each star scintillates on its own phase and rate.
  float t = uTime * (0.4 + fract(aPhase) * 1.1) + aPhase * 6.283;
  vTwinkle = 0.55 + 0.45 * sin(t);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // Attenuate with distance so the far layer reads as further away.
  float attenuation = 260.0 / max(-mvPosition.z, 1.0);
  gl_PointSize = aSize * attenuation * uPixelRatio * (0.75 + vTwinkle * 0.4) * uReveal;

  gl_Position = projectionMatrix * mvPosition;
}
`;

export const STARFIELD_FRAGMENT = /* glsl */ `
precision mediump float;

varying vec3  vColor;
varying float vTwinkle;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;

  // Soft core with a faint cross-flare on the brighter stars.
  float core = pow(1.0 - d * 2.0, 2.6);
  float flare = pow(max(0.0, 1.0 - abs(c.x) * 14.0), 3.0)
              + pow(max(0.0, 1.0 - abs(c.y) * 14.0), 3.0);

  float alpha = clamp(core + flare * 0.16 * vTwinkle, 0.0, 1.0) * vTwinkle;

  gl_FragColor = vec4(vColor * (1.0 + vTwinkle * 0.6), alpha);
}
`;

export const NEBULA_VERTEX = /* glsl */ `
varying vec3 vObjectPos;

void main() {
  vObjectPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const NEBULA_FRAGMENT = /* glsl */ `
precision mediump float;

uniform float uTime;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uReveal;

varying vec3 vObjectPos;

${NOISE_GLSL}

void main() {
  vec3 dir = normalize(vObjectPos);

  // Very slow drift: perceptible over tens of seconds, never distracting.
  vec3 p = dir * 1.6 + vec3(0.0, uTime * 0.004, 0.0);

  float cloud = warpedFbm(p, 2.4, 5) * 0.5 + 0.5;
  float wisps = ridged(p * 2.6, 4, 2.2, 0.5);

  float density = smoothstep(0.42, 0.92, cloud) * 0.75
                + smoothstep(0.6, 1.0, wisps) * 0.25;

  vec3 color = mix(uColorA, uColorB, smoothstep(0.3, 0.85, cloud));

  // Fade toward the poles so the sphere seam never shows.
  float polar = 1.0 - pow(abs(dir.y), 3.0);

  gl_FragColor = vec4(color * density * polar * 1.6, density * polar * 0.55 * uReveal);
}
`;
