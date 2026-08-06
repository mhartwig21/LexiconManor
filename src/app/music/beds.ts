/**
 * app/music/beds.ts — ambience beds. OWNER: A8.
 *
 * Pre-rendered noise buffers (pink/brown, generated at ctx.sampleRate, never
 * fetched) looping under the music: rain and fireplace, plus the Entrance
 * Hall clock (scheduled ticks at ≈−36 dB — subliminal, AAA 8.6).
 *
 * Budget: exactly 2 looping noise sources (≤4 allowed). Loop points on plain
 * noise have no audible seam, and beds are non-musical, so loop=true is fine
 * here (the no-loop rule applies to musical material).
 * Bed mix trims live on per-bed gains; the whole bed bus sits −18…−30 dB
 * under music via graph.bedGain.
 */

import type { Rng } from '../../engine/rng';
import { createRng } from '../../engine/rng';
import { dbToGain, type AudioGraph } from './graph';
import { noiseTransient } from './instruments';

export interface BedMix {
  rain: number;  // 0..1
  fire: number;  // 0..1
  clock: number; // 0..1 (tick probability/level)
}

function makeNoiseBuffer(ctx: AudioContext, kind: 'pink' | 'brown', seconds: number, seed: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const rng = createRng(seed + ch * 101);
    const data = buf.getChannelData(ch);
    if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (rng() * 2 - 1)) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      // Voss-McCartney-ish pink via 3 one-pole stages.
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = rng() * 2 - 1;
        b0 = 0.997 * b0 + 0.029591 * white;
        b1 = 0.985 * b1 + 0.032534 * white;
        b2 = 0.95 * b2 + 0.048056 * white;
        data[i] = (b0 + b1 + b2 + white * 0.05) * 2.1;
      }
    }
    // Short crossfade-free loop safety: taper 20ms at both ends toward the
    // same value class (noise, so a linear taper into silence is inaudible
    // when both ends match).
    const taper = Math.floor(rate * 0.02);
    for (let i = 0; i < taper; i++) {
      const k = i / taper;
      data[i]! *= k;
      data[len - 1 - i]! *= k;
    }
  }
  return buf;
}

export class Beds {
  private graph: AudioGraph | null = null;
  private rainGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private mix: BedMix = { rain: 0, fire: 0, clock: 0 };
  private rng: Rng = createRng(0xbed);

  start(graph: AudioGraph): void {
    if (this.graph === graph) return;
    this.stop();
    this.graph = graph;
    const { ctx } = graph;

    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = makeNoiseBuffer(ctx, 'pink', 4, 0x9a1);
    rainSrc.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 900;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.0001;
    rainSrc.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(graph.bedIn);

    const fireSrc = ctx.createBufferSource();
    fireSrc.buffer = makeNoiseBuffer(ctx, 'brown', 4, 0x3f2);
    fireSrc.loop = true;
    const fireFilter = ctx.createBiquadFilter();
    fireFilter.type = 'lowpass';
    fireFilter.frequency.value = 420;
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0.0001;
    fireSrc.connect(fireFilter);
    fireFilter.connect(this.fireGain);
    this.fireGain.connect(graph.bedIn);

    rainSrc.start();
    fireSrc.start();
    this.sources = [rainSrc, fireSrc];
    this.applyMix(2);
  }

  stop(): void {
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.sources = [];
    this.rainGain = null;
    this.fireGain = null;
    this.graph = null;
  }

  setMix(mix: Partial<BedMix>, rampSeconds = 2): void {
    this.mix = { ...this.mix, ...mix };
    this.applyMix(rampSeconds);
  }

  private applyMix(rampSeconds: number): void {
    const g = this.graph;
    if (!g) return;
    const now = g.ctx.currentTime;
    const tau = Math.max(0.05, rampSeconds / 3);
    this.rainGain?.gain.setTargetAtTime(Math.max(0.0001, this.mix.rain * 0.6), now, tau);
    this.fireGain?.gain.setTargetAtTime(Math.max(0.0001, this.mix.fire * 0.7), now, tau);
  }

  /**
   * Scheduler hook — call from a lookahead task. Sprinkles event grains:
   * rain droplets, fire crackle clusters, and the 1.0s clock tick.
   * Returns seconds until it wants to fire again.
   */
  sprinkle(at: number): number {
    const g = this.graph;
    if (!g) return 0.5;
    // Clock: exact 1.0s grid when audible (subliminal −36 dB, AAA 8.6).
    if (this.mix.clock > 0.01) {
      noiseTransient(g, {
        when: Math.ceil(at) /* next whole second */,
        gainDb: -36 + this.mix.clock * 4,
        filterHz: 2100,
        filterType: 'bandpass',
        playbackRate: 0.8,
      });
    }
    // Droplets ride the rain level.
    if (this.mix.rain > 0.05 && this.rng() < this.mix.rain * 0.7) {
      noiseTransient(g, {
        when: at + this.rng() * 0.4,
        gainDb: -26,
        filterHz: 2600 + this.rng() * 2200,
        playbackRate: 1.6 + this.rng(),
      });
    }
    // Crackle clusters ride the fire level.
    if (this.mix.fire > 0.05 && this.rng() < this.mix.fire * 0.5) {
      const n = 1 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) {
        noiseTransient(g, {
          when: at + this.rng() * 0.5,
          gainDb: -28 - this.rng() * 6,
          filterHz: 900 + this.rng() * 900,
          playbackRate: 0.7 + this.rng() * 0.8,
        });
      }
    }
    return this.mix.clock > 0.01 ? 0.98 : 0.4 + this.rng() * 0.3;
  }
}
