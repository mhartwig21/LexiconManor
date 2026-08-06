/**
 * scripts/gen-pwa-assets.ts — OWNER: A8 (Platform).
 *
 * Generates the installed-app identity assets (ARCHITECTURE §9, AAA 7.1–7.2):
 *  - public/icons/icon-192.png, icon-512.png            (any-purpose)
 *  - public/icons/icon-maskable-512.png                 (66% safe zone)
 *  - public/icons/apple-touch-icon.png                  (180×180, OPAQUE)
 *  - public/splash/*.png                                (4 device classes × light/dark)
 *
 * The design is drawn in code (inked monogram on parchment, IM Fell English
 * from the self-hosted woff2) and rasterized with the repo's own playwright —
 * no external generator dependency (pwa-asset-generator would need an npm
 * install, which agents may not run). Deterministic: same inputs → same PNGs.
 *
 * Run: npx tsx scripts/gen-pwa-assets.ts
 * It prints the <link> tag block for index.html when done.
 */

import { chromium, type Browser } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
const splashDir = join(root, 'public', 'splash');
mkdirSync(iconsDir, { recursive: true });
mkdirSync(splashDir, { recursive: true });

// Playwright's pinned browser build may not be installed on the dev box, but
// a compatible newer build often is — probe known locations.
function findChromium(): string | undefined {
  const home = process.env.LOCALAPPDATA ?? '';
  const base = join(home, 'ms-playwright');
  if (!existsSync(base)) return undefined;
  const candidates = ['chromium_headless_shell-1234', 'chromium-1234'];
  for (const c of candidates) {
    for (const exe of ['chrome-headless-shell-win64/chrome-headless-shell.exe', 'chrome-win64/chrome.exe']) {
      const p = join(base, c, exe);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const fellB64 = readFileSync(join(root, 'public/fonts/im-fell-english-400-latin.woff2')).toString('base64');
const garamondB64 = readFileSync(join(root, 'public/fonts/eb-garamond-400-latin.woff2')).toString('base64');

const PALETTE = {
  light: { paper: '#f0e7d8', paperEdge: '#cdbfa4', ink: '#2b2118', inkSoft: '#55452f', wax: '#8c2b2b' },
  dark: { paper: '#241d15', paperEdge: '#4a3d2c', ink: '#e7dcc6', inkSoft: '#c2b394', wax: '#b04a41' },
};

const fontFaces = `
  @font-face { font-family: 'IM Fell English'; src: url(data:font/woff2;base64,${fellB64}) format('woff2'); }
  @font-face { font-family: 'EB Garamond'; src: url(data:font/woff2;base64,${garamondB64}) format('woff2'); }
`;

/** The inked monogram: double-ruled parchment plate, LM ligature, wax diamond. */
function iconHtml(size: number, opts: { maskable?: boolean; theme?: 'light' | 'dark' } = {}): string {
  const p = PALETTE[opts.theme ?? 'light'];
  // Maskable: all meaningful ink inside the central 66% safe zone.
  const scale = opts.maskable ? 0.62 : 0.84;
  const s = size * scale;
  const border = Math.max(2, Math.round(size * 0.012));
  const inner = Math.max(1, Math.round(size * 0.006));
  return `<!doctype html><meta charset="utf-8"><style>
    ${fontFaces}
    html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}
    body{background:${p.paper};display:grid;place-items:center}
    .plate{width:${s}px;height:${s}px;display:grid;place-items:center;position:relative;
      border:${border}px solid ${p.ink};border-radius:${size * 0.04}px;box-sizing:border-box}
    .plate::after{content:'';position:absolute;inset:${Math.round(size * 0.018)}px;
      border:${inner}px solid ${p.inkSoft};border-radius:${size * 0.025}px;pointer-events:none}
    .mono{font-family:'IM Fell English',serif;color:${p.ink};font-size:${s * 0.52}px;
      line-height:1;letter-spacing:-0.06em;transform:translateY(-${s * 0.03}px)}
    .mono .l{font-size:${s * 0.4}px;vertical-align:${s * 0.015}px}
    .gem{position:absolute;bottom:${s * 0.11}px;left:50%;width:${s * 0.075}px;height:${s * 0.075}px;
      background:${p.wax};transform:translateX(-50%) rotate(45deg)}
  </style><body><div class="plate"><div class="mono"><span class="l">L</span>M</div><div class="gem"></div></div></body>`;
}

/** Splash: quiet parchment sheet, monogram plate + wordmark, portrait. */
function splashHtml(w: number, h: number, theme: 'light' | 'dark'): string {
  const p = PALETTE[theme];
  const plate = Math.round(Math.min(w, h) * 0.3);
  return `<!doctype html><meta charset="utf-8"><style>
    ${fontFaces}
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
    body{background:${p.paper};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${h * 0.03}px}
    .plate{width:${plate}px;height:${plate}px;display:grid;place-items:center;position:relative;
      border:3px solid ${p.ink};border-radius:${plate * 0.05}px;box-sizing:border-box}
    .plate::after{content:'';position:absolute;inset:7px;border:1px solid ${p.inkSoft};border-radius:${plate * 0.03}px}
    .mono{font-family:'IM Fell English',serif;color:${p.ink};font-size:${plate * 0.5}px;line-height:1;letter-spacing:-0.06em}
    .mono .l{font-size:${plate * 0.38}px}
    .word{font-family:'IM Fell English',serif;color:${p.ink};font-size:${Math.max(28, Math.round(w * 0.075))}px;letter-spacing:0.04em}
    .rule{width:${w * 0.4}px;height:1px;background:${p.paperEdge}}
    .gem{width:9px;height:9px;background:${p.wax};transform:rotate(45deg);margin-top:-${h * 0.012}px}
  </style><body>
    <div class="plate"><div class="mono"><span class="l">L</span>M</div></div>
    <div class="word">Lexicon Manor</div>
    <div class="rule"></div><div class="gem"></div>
  </body>`;
}

/** AAA 7.2 device classes: [logical w, logical h, dpr, label]. */
const SPLASH_SPECS: Array<[number, number, number, string]> = [
  [375, 667, 2, 'SE-class'],
  [390, 844, 3, 'iPhone 12/13/14'],
  [393, 852, 3, 'iPhone 15/16 Pro'],
  [430, 932, 3, 'Pro Max'],
];

async function shoot(browser: Browser, html: string, w: number, h: number, dpr: number, out: string): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready);
  writeFileSync(out, await page.screenshot({ type: 'png' }));
  await ctx.close();
  console.log('wrote', out);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
  try {
    await shoot(browser, iconHtml(192), 192, 192, 1, join(iconsDir, 'icon-192.png'));
    await shoot(browser, iconHtml(512), 512, 512, 1, join(iconsDir, 'icon-512.png'));
    await shoot(browser, iconHtml(512, { maskable: true }), 512, 512, 1, join(iconsDir, 'icon-maskable-512.png'));
    // Apple touch icon MUST be fully opaque (AAA 7.1) — parchment ground is.
    await shoot(browser, iconHtml(180), 180, 180, 1, join(iconsDir, 'apple-touch-icon.png'));

    const links: string[] = [];
    for (const [w, h, dpr, label] of SPLASH_SPECS) {
      for (const theme of ['light', 'dark'] as const) {
        const name = `splash-${w * dpr}x${h * dpr}${theme === 'dark' ? '-dark' : ''}.png`;
        await shoot(browser, splashHtml(w, h, theme), w, h, dpr, join(splashDir, name));
        const media =
          `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr})` +
          ` and (orientation: portrait)` +
          (theme === 'dark' ? ' and (prefers-color-scheme: dark)' : '');
        links.push(`    <!-- ${label}${theme === 'dark' ? ' (dark)' : ''} -->`);
        links.push(`    <link rel="apple-touch-startup-image" media="${media}" href="splash/${name}" />`);
      }
    }
    console.log('\nPaste into index.html <head>:\n');
    console.log(links.join('\n'));
  } finally {
    await browser.close();
  }
}

void main();
