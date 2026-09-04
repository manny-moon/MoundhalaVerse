export type SurfaceType = 'rocky' | 'ocean' | 'gas' | 'icy';

export interface PlanetConfig {
  readonly id: string;
  readonly label: string;
  readonly planetLabel: string;
  readonly color: string;
  readonly orbitRadius: number;
  readonly period: number;
  readonly size: number;
  readonly tilt: number;
  readonly type: SurfaceType;
  readonly hasRing: boolean;
}

/** Chosen once at startup from device capability; every cost decision reads it. */
export interface QualityProfile {
  readonly tier: 'low' | 'medium' | 'high';
  readonly pixelRatio: number;
  readonly starCount: number;
  readonly planetSegments: number;
  readonly sunSegments: number;
  readonly bloom: boolean;
  readonly bloomResolutionScale: number;
  readonly nebula: boolean;
}

export interface SolarSystemOptions {
  canvas: HTMLCanvasElement;
  planets: readonly PlanetConfig[];
  portraitUrl?: string;
  onSelect: (id: string) => void;
  onHoverChange: (hover: { id: string; label: string; x: number; y: number } | null) => void;
  onReady: () => void;
}
