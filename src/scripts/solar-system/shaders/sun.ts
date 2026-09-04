import { NOISE_GLSL } from './noise';

/**
 * The star at the centre.
 *
 * Surface is procedural plasma: granulation cells over a slower convective
 * churn, with brighter faculae along the cell boundaries. Hovering or focusing
 * the star crossfades a portrait into the photosphere (`uPortraitMix`), which is
 * the one deliberate piece of whimsy carried over from the first version of
 * this site.
 */

export const SUN_VERTEX = /* glsl */ `
varying vec3 vObjectPos;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vObjectPos = position;
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const SUN_FRAGMENT = /* glsl */ `
precision highp float;

uniform float     uTime;
uniform float     uPortraitMix;
uniform sampler2D uPortrait;
uniform float     uHasPortrait;
uniform float     uReveal;

varying vec3 vObjectPos;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec2 vUv;

${NOISE_GLSL}

void main() {
  vec3 p = normalize(vObjectPos) * 3.0;

  // Two timescales: slow convective churn under fast granulation.
  float churn = warpedFbm(p * 0.9 + vec3(0.0, uTime * 0.035, 0.0), 1.8, 5);
  float granules = ridged(p * 6.5 + vec3(uTime * 0.09, uTime * 0.05, 0.0), 4, 2.2, 0.55);

  float heat = churn * 0.55 + granules * 0.65;
  heat = clamp(heat * 0.5 + 0.5, 0.0, 1.0);

  // Blackbody-ish ramp: deep red core -> orange -> white-hot faculae.
  vec3 emberColor  = vec3(0.65, 0.11, 0.02);
  vec3 midColor    = vec3(1.0, 0.45, 0.05);
  vec3 hotColor    = vec3(1.0, 0.82, 0.35);
  vec3 whiteColor  = vec3(1.0, 0.98, 0.9);

  vec3 color = mix(emberColor, midColor, smoothstep(0.15, 0.5, heat));
  color = mix(color, hotColor, smoothstep(0.45, 0.75, heat));
  color = mix(color, whiteColor, smoothstep(0.78, 0.96, heat));

  // Faculae: bright filaments along granulation boundaries.
  float faculae = smoothstep(0.72, 0.95, granules);
  color += whiteColor * faculae * 0.6;

  // Sunspots: rare, slow-drifting cool patches.
  float spots = smoothstep(0.58, 0.72, fbm(p * 1.4 + vec3(uTime * 0.01), 4, 2.0, 0.5));
  color = mix(color, emberColor * 0.45, spots * 0.5);

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);

  // Limb brightening (opposite of a planet) plus a hot corona edge.
  float facing = max(dot(N, V), 0.0);
  float limb = pow(1.0 - facing, 2.2);
  color += vec3(1.0, 0.55, 0.18) * limb * 1.35;

  // Portrait reveal: the photo is dodged into the plasma, never pasted flat.
  if (uHasPortrait > 0.5 && uPortraitMix > 0.001) {
    vec3 portrait = texture2D(uPortrait, vUv).rgb;
    float luma = dot(portrait, vec3(0.299, 0.587, 0.114));

    // Warp the sample by the plasma so it sits *in* the surface.
    vec3 tinted = mix(midColor, whiteColor, luma) * (0.75 + heat * 0.6);

    // Fade the reveal out toward the limb so it never breaks the silhouette.
    float mask = smoothstep(0.05, 0.55, facing) * uPortraitMix;
    color = mix(color, tinted, mask * 0.85);
  }

  // Enough HDR headroom for bloom to catch, but low enough that ACES doesn't
  // clip the whole disc to white; the granulation has to stay readable.
  color *= 1.32 * uReveal;

  gl_FragColor = vec4(color, 1.0);
}
`;

/** Billboarded corona/glare drawn behind the star. */
export const CORONA_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CORONA_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3  uColor;
uniform float uReveal;

varying vec2 vUv;

${NOISE_GLSL}

void main() {
  vec2 centered = vUv - 0.5;
  float d = length(centered) * 2.0;
  if (d > 1.0) discard;

  float angle = atan(centered.y, centered.x);

  // Radial streamers that breathe slowly.
  float rays = fbm(vec3(cos(angle) * 2.2, sin(angle) * 2.2, uTime * 0.06), 4, 2.1, 0.55);
  rays = rays * 0.5 + 0.5;

  float falloff = pow(1.0 - d, 3.2);
  float body = pow(1.0 - d, 1.4) * 0.42;

  float alpha = (falloff * (0.4 + rays * 0.55) + body * 0.7) * uReveal;

  gl_FragColor = vec4(uColor * (1.0 + rays * 0.5), clamp(alpha, 0.0, 1.0));
}
`;
