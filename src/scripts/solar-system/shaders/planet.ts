import { NOISE_GLSL } from './noise';

/**
 * Planet surface. One shader covers four surface archetypes (rocky, ocean, gas,
 * icy) selected by `uType`, so all five planets share a single compiled program
 * variant per type and stay visually related.
 */

export const PLANET_VERTEX = /* glsl */ `
varying vec3 vObjectPos;
varying vec3 vNormalW;
varying vec3 vViewDir;

void main() {
  vObjectPos = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const PLANET_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3  uBaseColor;
uniform vec3  uLightPos;
uniform float uSeed;
uniform int   uType;      // 0 rocky · 1 ocean · 2 gas · 3 icy
uniform float uHover;     // 0..1, eased hover weight
uniform float uReveal;    // 0..1, entrance wipe

varying vec3 vObjectPos;
varying vec3 vNormalW;
varying vec3 vViewDir;

${NOISE_GLSL}

vec3 rockySurface(vec3 p, out float rough) {
  float continents = fbm(p * 1.7, 6, 2.1, 0.52);
  float mountains  = ridged(p * 4.5, 5, 2.0, 0.5);
  float detail     = fbm(p * 14.0, 3, 2.0, 0.5) * 0.12;

  float h = continents + mountains * 0.35 + detail;

  vec3 low  = uBaseColor * 0.32;
  vec3 mid  = uBaseColor * 0.85;
  vec3 high = mix(uBaseColor, vec3(1.0), 0.55);

  vec3 col = mix(low, mid, smoothstep(-0.25, 0.25, h));
  col = mix(col, high, smoothstep(0.42, 0.85, h));

  // Dusty craters
  float craters = smoothstep(0.62, 0.68, ridged(p * 8.0 + uSeed, 3, 2.3, 0.5));
  col = mix(col, col * 0.62, craters * 0.5);

  rough = 0.85;
  return col;
}

vec3 oceanSurface(vec3 p, out float rough) {
  float land = fbm(p * 2.0 + uSeed, 6, 2.0, 0.5);
  float coast = smoothstep(0.02, 0.16, land);

  vec3 deepWater  = mix(uBaseColor * 0.18, vec3(0.02, 0.06, 0.18), 0.55);
  vec3 shallow    = mix(uBaseColor, vec3(0.35, 0.85, 0.95), 0.35);
  vec3 landColor  = mix(vec3(0.18, 0.32, 0.2), uBaseColor * 0.7, 0.35);
  vec3 sandColor  = vec3(0.72, 0.66, 0.45);

  vec3 water = mix(deepWater, shallow, smoothstep(-0.35, 0.02, land));
  vec3 ground = mix(sandColor, landColor, smoothstep(0.04, 0.3, land));
  ground = mix(ground, vec3(0.92, 0.94, 0.98), smoothstep(0.55, 0.78, land)); // snowcaps

  vec3 col = mix(water, ground, coast);

  // Cloud deck, drifting
  float clouds = fbm(p * 3.1 + vec3(uTime * 0.012, 0.0, uTime * 0.008), 5, 2.2, 0.5);
  clouds = smoothstep(0.18, 0.62, clouds);
  col = mix(col, vec3(1.0), clouds * 0.55);

  rough = mix(0.15, 0.9, coast);
  return col;
}

vec3 gasSurface(vec3 p, out float rough) {
  // Latitude bands, distorted by domain-warped turbulence so they swirl.
  // The turbulence term stays low: push it much past ~1.2 and the banding
  // dissolves into marble instead of reading as a gas giant.
  vec3 flow = p + vec3(uTime * 0.02, 0.0, 0.0);
  float turbulence = warpedFbm(flow * 1.3 + uSeed, 1.1, 4);

  float bands = sin((p.y * 11.0) + turbulence * 1.15);
  bands = bands * 0.5 + 0.5;
  // Sharpen so band edges stay crisp at close range.
  bands = smoothstep(0.14, 0.86, bands);

  vec3 darkBand  = uBaseColor * 0.42;
  vec3 lightBand = mix(uBaseColor, vec3(1.0, 0.96, 0.88), 0.55);
  vec3 col = mix(darkBand, lightBand, bands);

  // A storm: the eye sits off-centre and counter-rotates.
  vec3 stormCenter = normalize(vec3(0.55, -0.32, 0.75));
  float d = distance(normalize(p), stormCenter);
  float storm = smoothstep(0.34, 0.0, d);
  float swirl = warpedFbm(p * 5.0 - vec3(uTime * 0.05, 0.0, 0.0), 2.2, 4);
  col = mix(col, mix(vec3(0.85, 0.35, 0.25), uBaseColor, 0.3) * (0.8 + swirl * 0.4), storm * 0.85);

  rough = 0.95;
  return col;
}

vec3 icySurface(vec3 p, out float rough) {
  float cracks = 1.0 - abs(fbm(p * 3.4 + uSeed, 5, 2.4, 0.5));
  cracks = pow(smoothstep(0.55, 1.0, cracks), 2.5);

  float mottle = fbm(p * 7.0, 4, 2.0, 0.5) * 0.5 + 0.5;

  vec3 ice   = mix(vec3(0.82, 0.9, 0.98), uBaseColor, 0.35);
  vec3 shade = mix(ice * 0.6, uBaseColor * 0.5, 0.5);

  vec3 col = mix(shade, ice, mottle);
  col = mix(col, mix(uBaseColor, vec3(0.4, 0.7, 0.95), 0.5) * 0.7, cracks * 0.7);

  rough = 0.25;
  return col;
}

void main() {
  vec3 p = normalize(vObjectPos) * 2.0 + uSeed;

  float rough = 0.8;
  vec3 albedo;

  if (uType == 0)      albedo = rockySurface(p, rough);
  else if (uType == 1) albedo = oceanSurface(p, rough);
  else if (uType == 2) albedo = gasSurface(p, rough);
  else                 albedo = icySurface(p, rough);

  vec3 N = normalize(vNormalW);
  vec3 L = normalize(uLightPos);
  vec3 V = normalize(vViewDir);

  // Wrapped diffuse: softens the terminator so the night side isn't a hard edge.
  float ndl = dot(N, L);
  float diffuse = clamp((ndl + 0.22) / 1.22, 0.0, 1.0);
  diffuse = pow(diffuse, 1.35);

  // Specular, only meaningful on smooth surfaces (water, ice).
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), mix(180.0, 12.0, rough)) * (1.0 - rough);

  // Fresnel rim in the planet's own accent; reads as atmosphere at grazing angles.
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  vec3 sunTint = vec3(1.0, 0.93, 0.82);
  vec3 color = albedo * (diffuse * 1.25 + 0.05) * sunTint;
  color += sunTint * spec * 1.6;
  color += uBaseColor * fresnel * (0.35 + uHover * 0.9) * (0.25 + diffuse * 0.9);

  // Ambient bounce so the dark side keeps a trace of colour.
  color += albedo * vec3(0.05, 0.06, 0.12) * 0.9;

  // Hover: lift the whole body slightly rather than only the rim.
  color *= 1.0 + uHover * 0.18;

  // Entrance wipe: surface resolves from the terminator outward.
  color *= smoothstep(0.0, 0.35, uReveal);

  gl_FragColor = vec4(color, 1.0);
}
`;

/** Thin additive shell drawn just outside the planet: the visible atmosphere. */
export const ATMOSPHERE_VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;

void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
precision highp float;

uniform vec3  uColor;
uniform vec3  uLightPos;
uniform float uIntensity;
uniform float uHover;
uniform float uReveal;

varying vec3 vNormalW;
varying vec3 vViewDir;

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);
  vec3 L = normalize(uLightPos);

  // Rim brightness peaks at grazing angles. A high exponent keeps the glow
  // pinned to the limb - at close range a soft falloff reads as a glass
  // bubble sitting around the planet rather than as atmosphere.
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.5);

  // ...but only where the sun actually hits, so the shadowed limb stays dark.
  float lit = smoothstep(-0.35, 0.55, dot(N, L));

  float alpha = fresnel * lit * uIntensity * (1.0 + uHover * 1.1) * uReveal;

  gl_FragColor = vec4(uColor * (1.25 + uHover), clamp(alpha, 0.0, 1.0));
}
`;

/**
 * Planetary ring.
 *
 * Banded in the radial direction with gaps, lit from the star, and translucent
 * enough to show the planet through it. A flat `MeshBasicMaterial` disc reads
 * as plastic at close range; this does not.
 */
export const RING_VERTEX = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vWorldPos;

void main() {
  vLocalPos = position;
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const RING_FRAGMENT = /* glsl */ `
precision highp float;

uniform vec3  uColor;
uniform vec3  uPlanetCenter;
uniform vec3  uLightPos;
uniform float uInner;
uniform float uOuter;
uniform float uPlanetRadius;
uniform float uOpacity;
uniform float uHover;

varying vec3 vLocalPos;
varying vec3 vWorldPos;

${NOISE_GLSL}

void main() {
  float radius = length(vLocalPos.xy);
  float t = clamp((radius - uInner) / max(uOuter - uInner, 0.0001), 0.0, 1.0);

  // Concentric banding: a few octaves of 1D noise plus a hard Cassini-style gap.
  float fine   = fbm(vec3(t * 42.0, 0.0, 0.0), 4, 2.0, 0.55) * 0.5 + 0.5;
  float coarse = fbm(vec3(t * 9.0, 3.7, 0.0), 3, 2.0, 0.5) * 0.5 + 0.5;

  float density = mix(coarse, fine, 0.55);
  density = smoothstep(0.28, 0.85, density);

  // A clean division about two-thirds out.
  float gap = smoothstep(0.02, 0.07, abs(t - 0.62));
  density *= gap;

  // Feather both edges so the ring doesn't end on a hard line.
  density *= smoothstep(0.0, 0.09, t) * (1.0 - smoothstep(0.88, 1.0, t));

  // Shadow: the planet blocks the star over part of the ring.
  vec3 toLight = normalize(uLightPos);
  vec3 fromPlanet = vWorldPos - uPlanetCenter;
  float alongLight = dot(fromPlanet, toLight);
  float perp = length(fromPlanet - toLight * alongLight);
  float shadow = (alongLight < 0.0)
    ? smoothstep(uPlanetRadius * 0.75, uPlanetRadius * 1.25, perp)
    : 1.0;

  vec3 color = uColor * (0.45 + shadow * 0.85) * (1.0 + uHover * 0.5);

  gl_FragColor = vec4(color, density * uOpacity * (0.35 + shadow * 0.65));
}
`;
