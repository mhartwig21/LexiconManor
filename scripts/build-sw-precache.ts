/**
 * scripts/build-sw-precache.ts — OWNER: A8 (Platform).
 *
 * Post-build step (run AFTER `vite build`):
 *  1. Globs dist/ and injects the full precache manifest into dist/sw.js —
 *     including every generated content JSON, or offline play breaks on room
 *     entry (AAA 7.4).
 *  2. Stamps the deploy base into dist/manifest.webmanifest start_url/scope
 *     (vite copies public/ verbatim and only rewrites its own assets).
 *  3. Hard-checks base-path integrity (AAA 7.5): built index.html asset URLs,
 *     manifest start_url/scope, and every SW precache URL must carry the
 *     deploy prefix. Non-zero exit fails CI.
 *
 * Base comes from MANOR_BASE, matching vite.config.ts ('/LexiconManor/').
 * Run: npx tsx scripts/build-sw-precache.ts
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const BASE = process.env.MANOR_BASE ?? '/LexiconManor/';

const PRECACHE_EXT = /\.(js|css|html|png|webp|avif|svg|json|webmanifest|woff2)$/;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!existsSync(dist)) fail('dist/ not found — run `vite build` first.');
if (!BASE.startsWith('/') || !BASE.endsWith('/')) fail(`MANOR_BASE must start and end with '/': ${BASE}`);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// 1. Build the precache list --------------------------------------------------
const files = walk(dist)
  .map((p) => relative(dist, p).split('\\').join('/'))
  .filter((p) => PRECACHE_EXT.test(p) && p !== 'sw.js');

const urls = files.map((p) => BASE + p);
const hash = createHash('sha256');
for (const p of files.sort()) {
  hash.update(p);
  hash.update(readFileSync(join(dist, p)));
}
const version = hash.digest('hex').slice(0, 12);

// 2. Inject into dist/sw.js ---------------------------------------------------
const swPath = join(dist, 'sw.js');
if (!existsSync(swPath)) fail('dist/sw.js missing — is public/sw.js present?');
let sw = readFileSync(swPath, 'utf8');
if (!sw.includes('__INJECT_PRECACHE__') || !sw.includes('__INJECT_VERSION__')) {
  fail('sw.js injection markers missing');
}
sw = sw
  .replace(/\/\* __INJECT_VERSION__ \*\/\s*\nconst VERSION = '[^']*';/, `const VERSION = '${version}';`)
  .replace(/\/\* __INJECT_PRECACHE__ \*\/\s*\nconst PRECACHE = \[\];/, `const PRECACHE = ${JSON.stringify(urls, null, 2)};`);
writeFileSync(swPath, sw);
console.log(`✓ sw.js: ${urls.length} precache URLs, version ${version}`);

// 3. Stamp the manifest -------------------------------------------------------
const manifestPath = join(dist, 'manifest.webmanifest');
if (!existsSync(manifestPath)) fail('dist/manifest.webmanifest missing');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
manifest.id = BASE;
manifest.start_url = BASE;
manifest.scope = BASE;
manifest.icons = (manifest.icons as Array<{ src: string }>).map((i) => ({
  ...i,
  src: i.src.startsWith(BASE) ? i.src : BASE + i.src.replace(/^\.?\//, ''),
}));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✓ manifest.webmanifest: start_url/scope/icons stamped with ${BASE}`);

// 4. Hard-check base-path integrity (AAA 7.5) --------------------------------
const problems: string[] = [];

const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8');
const assetRefs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1]!)
  .filter((u) => !u.startsWith('data:') && !u.startsWith('http'));
for (const u of assetRefs) {
  if (!u.startsWith(BASE)) problems.push(`index.html ref lacks base prefix: ${u}`);
}
if (manifest.start_url !== BASE) problems.push(`manifest start_url != ${BASE}`);
if (manifest.scope !== BASE) problems.push(`manifest scope != ${BASE}`);
for (const u of urls) {
  if (!u.startsWith(BASE)) problems.push(`precache URL lacks base prefix: ${u}`);
}
const mustPrecache = ['index.html', 'manifest.webmanifest'];
for (const need of mustPrecache) {
  if (!files.includes(need)) problems.push(`precache missing ${need}`);
}
if (!files.some((f) => f.startsWith('assets/') && f.endsWith('.js'))) {
  problems.push('precache contains no built JS bundle');
}
if (!files.some((f) => f.startsWith('icons/'))) problems.push('precache contains no icons');
if (!files.some((f) => f.startsWith('fonts/') && f.endsWith('.woff2'))) {
  problems.push('precache contains no self-hosted fonts');
}

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log('✓ base-path integrity check passed (AAA 7.5)');
