import type { QualityProfile } from './types';

const PROFILES: Record<QualityProfile['tier'], QualityProfile> = {
  high: {
    tier: 'high',
    pixelRatio: 2,
    starCount: 4200,
    planetSegments: 96,
    sunSegments: 128,
    bloom: true,
    bloomResolutionScale: 0.5,
    nebula: true,
  },
  medium: {
    tier: 'medium',
    pixelRatio: 1.6,
    starCount: 2400,
    planetSegments: 64,
    sunSegments: 80,
    bloom: true,
    bloomResolutionScale: 0.35,
    nebula: true,
  },
  low: {
    tier: 'low',
    pixelRatio: 1.25,
    starCount: 1100,
    planetSegments: 40,
    sunSegments: 48,
    bloom: false,
    bloomResolutionScale: 0.25,
    nebula: false,
  },
};

/**
 * Picks a rendering tier up front rather than adapting mid-flight, so the frame
 * cost stays predictable. Coarse pointer + small viewport is treated as a phone;
 * low core count or an explicit data-saver hint drops to the cheapest tier.
 */
export function detectQuality(): QualityProfile {
  if (typeof window === 'undefined') return PROFILES.medium;

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 640;
  const saveData =
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ??
    false;

  if (saveData || cores <= 2 || memory <= 2) return PROFILES.low;
  if (coarse && narrow) return PROFILES.low;
  if (coarse || cores <= 4 || memory <= 4) return PROFILES.medium;

  return PROFILES.high;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Feature-detects WebGL without leaking the probe context. */
export function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
