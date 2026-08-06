/**
 * Vitest global setup: resolve the content-pool registry before any test
 * runs. Adapters/selectors export lazy pool views over app/pools.ts
 * (AAA 9.6 — content rides a lazy chunk in the app; in the app the App-level
 * gate awaits loadPools() before rendering). Tests get the same guarantee
 * here, once, instead of per-file beforeAll boilerplate.
 */
import { loadPools } from '../src/app/pools';

await loadPools();
