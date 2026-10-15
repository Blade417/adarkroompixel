/**
 * Palette of the pixel room. The first nine entries are the handoff palette
 * (docs/art/pixel-room-v1/README.md); the rest are placeholder-only tones used by the
 * procedural stand-in art until the real sheets arrive.
 */
export const PAL = {
  base: '#101218',
  outline: '#191d25',
  coldGrey: '#333c4a',
  wood: '#565044',
  warmShadow: '#81513a',
  flame: '#d87b42',
  flameCore: '#f0c17a',
  text: '#e2d5b8',
  textDim: '#a2a7af',

  night: '#141a26',
  nightDeep: '#0b1019',
  nightHigh: '#1d2738',
  snow: '#c9d3e0',
  snowShade: '#4a5566',
  frost: '#8fa3b8',
  coldLight: '#9cc8f0',
  woodDark: '#3a352e',
  woodMid: '#4c463c',
  woodLight: '#6f6553',
  floor: '#3e382f',
  floorDark: '#342e27',
  stone: '#4a4a4f',
  stoneDark: '#3f3f44',
  stoneLight: '#6b6a6a',
  mortar: '#2b2d33',
  soot: '#0b0d12',
  charcoal: '#2a2420',
  charcoalLight: '#3d332b',
  ember: '#a8452a',
  logEnd: '#7a6650',
  logRing: '#5e4e3d',
  fur: '#6e665c',
  furLight: '#8f877b',
  cloth: '#3d4350',
  clothLight: '#59606d',
  clothDark: '#2b2f38',
  iron: '#25282e',

  // the stranger's cloak and boots, sampled from stranger-huddled.png (for the stand-in poses)
  figureLine: '#121418',
  cloakDark: '#22252c',
  cloak: '#2e323a',
  cloakMid: '#3b404a',
  cloakLight: '#4b515c',
  cloakWarm: '#5b4d42',
  hoodShadow: '#0e0f12',
  boot: '#4a3a2e',
  bootLight: '#6b5341'
} as const;

export type PaletteKey = keyof typeof PAL;

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hex([r, g, b]: readonly number[]): string {
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1)}`;
}

/** linear blend of two palette colours, t in [0, 1] */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  const k = Math.max(0, Math.min(1, t));
  return hex(A.map((v, i) => v + (B[i] - v) * k));
}
