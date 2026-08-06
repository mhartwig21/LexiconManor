/**
 * Paper-grain tile generator — AAA 6.13.
 *
 * Emits `src/ui/theme/grain.png`: ONE small, seamlessly-tiling, pre-rendered
 * noise tile that `src/index.css` lays over the whole app as a fixed overlay
 * (multiply in daylight, screen in candlelight — tokens.css `--grain-blend`).
 *
 * Why a build script and not `feTurbulence`: 6.13 forbids live turbulence on
 * any scroll surface (it re-rasterises on every composite and shows up as
 * paint cost on an A14), and 9.7 requires the grain be a static compressed
 * image. This runs offline, checks itself into the repo like every other
 * generated asset, and is deterministic — the same seed always emits the same
 * bytes, so a regen is a no-op diff unless the parameters actually change.
 *
 * Format: 96x96, 4-bit greyscale (16 levels). Four bits is far more tonal
 * resolution than a ~5%-opacity blend layer can show, and it halves the
 * payload against 8-bit: ~3KB versus the 10KB ceiling. Zero dependencies —
 * a hand-rolled PNG chunker over node:zlib.
 *
 * Seamlessness: the fine grain is per-pixel (uncorrelated, so it tiles by
 * construction) and the coarse mottle is a wrapped bilinear lattice, so the
 * tile has no visible repeat seam at any scroll offset.
 *
 *   node scripts/gen-grain.mjs [--check]
 *
 * `--check` regenerates into memory and fails if the committed asset differs
 * or exceeds the 10KB budget (for CI).
 */

import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/ui/theme/grain.png');

const SIZE = 96;          // tile edge, matches background-size in index.css
const LATTICE = 12;       // coarse mottle cells across the tile (8px cells)
const MID = 7.5;          // mid-grey in 4-bit space (0..15)
const FINE_AMP = 2.6;     // per-pixel tooth
const COARSE_AMP = 1.5;   // slow paper mottle
const BUDGET = 10 * 1024; // AAA 6.13

/** Deterministic 32-bit PRNG (mulberry32) — same tile on every machine. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Wrapped bilinear value noise — tiles seamlessly because indices wrap. */
function coarseField(rand) {
  const lat = Array.from({ length: LATTICE * LATTICE }, () => rand() * 2 - 1);
  const at = (cx, cy) => lat[((cy + LATTICE) % LATTICE) * LATTICE + ((cx + LATTICE) % LATTICE)];
  const cell = SIZE / LATTICE;
  const field = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const gy = Math.floor(y / cell);
    const fy = smooth((y - gy * cell) / cell);
    for (let x = 0; x < SIZE; x++) {
      const gx = Math.floor(x / cell);
      const fx = smooth((x - gx * cell) / cell);
      const top = at(gx, gy) * (1 - fx) + at(gx + 1, gy) * fx;
      const bot = at(gx, gy + 1) * (1 - fx) + at(gx + 1, gy + 1) * fx;
      field[y * SIZE + x] = top * (1 - fy) + bot * fy;
    }
  }
  return field;
}

/** Build the raw 4-bit greyscale scanlines (filter byte 0 + packed pairs). */
function scanlines() {
  const rand = rng(0x1e10c04);
  const coarse = coarseField(rand);
  const stride = SIZE >> 1;                // two pixels per byte
  const raw = Buffer.alloc((1 + stride) * SIZE);
  let p = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[p++] = 0;                          // filter: None (noise defeats filters anyway)
    for (let x = 0; x < SIZE; x += 2) {
      const lvl = (i) => {
        const fine = (rand() * 2 - 1) * FINE_AMP;
        const v = MID + fine + coarse[i] * COARSE_AMP;
        return Math.max(0, Math.min(15, Math.round(v)));
      };
      const hi = lvl(y * SIZE + x);
      const lo = lvl(y * SIZE + x + 1);
      raw[p++] = (hi << 4) | lo;
    }
  }
  return raw;
}

// --- minimal PNG writer ----------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 4;   // bit depth
  ihdr[9] = 0;   // colour type: greyscale
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace
  const idat = deflateSync(scanlines(), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const bytes = png();
if (bytes.length > BUDGET) {
  console.error(`[grain] ${bytes.length}B exceeds the AAA 6.13 budget of ${BUDGET}B`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  let current;
  try {
    current = readFileSync(OUT);
  } catch {
    console.error('[grain] src/ui/theme/grain.png is missing — run `npm run assets:grain`');
    process.exit(1);
  }
  if (!current.equals(bytes)) {
    console.error('[grain] committed tile is stale — run `npm run assets:grain`');
    process.exit(1);
  }
  console.log(`[grain] ok — ${current.length}B (budget ${BUDGET}B)`);
} else {
  writeFileSync(OUT, bytes);
  console.log(`[grain] wrote ${OUT} — ${SIZE}x${SIZE}, 4-bit grey, ${bytes.length}B (budget ${BUDGET}B)`);
}
