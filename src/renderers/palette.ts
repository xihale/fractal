/**
 * Single source of truth for the fractal colouring.
 *
 * The gradient is a closed loop (last stop equals the first) mapped over
 * sqrt(smooth iteration count). sqrt keeps a stable appearance at any zoom
 * and distributes the colour bands evenly between the "far away" background
 * and the detail near the set boundary.
 *
 * The GLSL/WGSL snippets below are generated from these values, so every
 * renderer shares the same colours and mapping.
 */
const STOPS = [
  '#04070d', // ink
  '#0a2a43', // deep petrol
  '#12707f', // teal
  '#5fc9b0', // sea glass
  '#f2d79b', // sand
  '#d97845', // ember
  '#04070d', // back to ink
];

const INTERIOR = '#05070c';

const SCALE = 0.3;
const PHASE = 0.75;

export const MAX_ITERATIONS = 400;
export const BAILOUT_SQ = 256;

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

const STOP_RGB = STOPS.map(hexToRgb);
const INTERIOR_RGB = hexToRgb(INTERIOR);

const num = (n: number) => n.toFixed(6);
const glslVec = (rgb: [number, number, number]) =>
  `vec3(${rgb.map(num).join(', ')})`;
const wgslVec = (rgb: [number, number, number]) =>
  `vec3<f32>(${rgb.map(num).join(', ')})`;

export const PALETTE_GLSL = `
vec3 paletteFromSmooth(float s) {
    float u = fract(sqrt(max(s, 0.0)) * ${num(SCALE)} + ${num(PHASE)});
    vec3 c = ${glslVec(STOP_RGB[0])};
${STOP_RGB.slice(1)
  .map((rgb, index) => {
    const i = index + 1;
    return `    c = mix(c, ${glslVec(rgb)}, smoothstep(${num((i - 1) / (STOPS.length - 1))}, ${num(i / (STOPS.length - 1))}, u));`;
  })
  .join('\n')}
    return c;
}

vec3 interiorColor() {
    return ${glslVec(INTERIOR_RGB)};
}
`;

export const PALETTE_WGSL = `
fn palette_from_smooth(s: f32) -> vec3<f32> {
    let u = fract(sqrt(max(s, 0.0)) * ${num(SCALE)} + ${num(PHASE)});
    var c = ${wgslVec(STOP_RGB[0])};
${STOP_RGB.slice(1)
  .map((rgb, index) => {
    const i = index + 1;
    return `    c = mix(c, ${wgslVec(rgb)}, smoothstep(${num((i - 1) / (STOPS.length - 1))}, ${num(i / (STOPS.length - 1))}, u));`;
  })
  .join('\n')}
    return c;
}

fn interior_color() -> vec3<f32> {
    return ${wgslVec(INTERIOR_RGB)};
}
`;

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Continuous ("smooth") escape count, used to remove iteration banding. */
export function smoothEscape(iterations: number, magnitudeSq: number) {
  return iterations + 1 - Math.log2(0.5 * Math.log2(magnitudeSq));
}

/** Palette colour for a smooth escape count (0..255 RGB). */
export function paletteColor(smooth: number): [number, number, number] {
  const n = STOPS.length - 1;
  const u = (Math.sqrt(Math.max(smooth, 0)) * SCALE + PHASE) % 1;
  let r = STOP_RGB[0][0];
  let g = STOP_RGB[0][1];
  let b = STOP_RGB[0][2];

  for (let i = 1; i <= n; i++) {
    const t = smoothstep((i - 1) / n, i / n, u);
    r += (STOP_RGB[i][0] - r) * t;
    g += (STOP_RGB[i][1] - g) * t;
    b += (STOP_RGB[i][2] - b) * t;
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export const INTERIOR_RGB_255: [number, number, number] = [
  Math.round(INTERIOR_RGB[0] * 255),
  Math.round(INTERIOR_RGB[1] * 255),
  Math.round(INTERIOR_RGB[2] * 255),
];
