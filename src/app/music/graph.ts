/**
 * app/music/graph.ts — the ONE audio-graph constructor. OWNER: A8.
 *
 * `buildAudioGraph(ctx)` is idempotent per context (WeakMap cache), which is
 * what makes the sample-rate-flip teardown/rebuild fix possible: context.ts
 * closes a wedged context, and the next gesture's fresh context gets a fresh
 * graph here with zero special-casing.
 *
 * Permanent bus skeleton (ARCHITECTURE §8):
 *
 *   music voices → musicIn → moodLowpass → duckGain ─┐
 *   beds         → bedIn   → bedGain     → duckGain ─┼→ compressor → master → out
 *   sfx          → sfxIn ───────────────────────────┘
 *   any voice → reverbSend → preDelay → convolver → reverbReturn → compressor
 *
 * Budget (AAA 8.4, 8.13): exactly ONE ConvolverNode app-wide (its IR is
 * generated, ≤3s stereo, at ctx.sampleRate — never fetched), 1 master
 * compressor, ≤24 oscillators (voice counter lives here), ≤4 looping noise
 * sources, no ScriptProcessorNode, no AudioWorklet, no external assets.
 */

import { createRng } from '../../engine/rng';

export interface AudioGraph {
  ctx: AudioContext;
  sampleRate: number;
  /** Attach musical voices here (pre-lowpass, pre-duck). */
  musicIn: GainNode;
  /** Director-driven brightness: one lowpass over the whole music bus. */
  moodLowpass: BiquadFilterNode;
  /** duck.ts writes this gain; music + beds ride it, sfx does not. */
  duckGain: GainNode;
  /** Ambience beds attach here; bedGain sets the −18…−36 dB bed mix trim. */
  bedIn: GainNode;
  bedGain: GainNode;
  /** app/sound.ts routes its procedural cues here (un-ducked). */
  sfxIn: GainNode;
  /** Shared reverb send — connect a per-voice gain into this. */
  reverbSend: GainNode;
  reverbReturn: GainNode;
  compressor: DynamicsCompressorNode;
  master: GainNode;
  /** ≤24 simultaneous oscillators (AAA 8.13). */
  voices: { active: number; readonly max: number };
}

const graphs = new WeakMap<AudioContext, AudioGraph>();

export function buildAudioGraph(ctx: AudioContext): AudioGraph {
  const cached = graphs.get(ctx);
  if (cached) return cached;

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  // Gentle glue only: normal play must never exceed ~3 dB reduction (AAA 8.6).
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.28;
  compressor.connect(master);

  const duckGain = ctx.createGain();
  duckGain.gain.value = 1;
  duckGain.connect(compressor);

  const moodLowpass = ctx.createBiquadFilter();
  moodLowpass.type = 'lowpass';
  moodLowpass.frequency.value = 2200;
  moodLowpass.Q.value = 0.4;
  moodLowpass.connect(duckGain);

  const musicIn = ctx.createGain();
  musicIn.gain.value = 0.9;
  musicIn.connect(moodLowpass);

  const bedGain = ctx.createGain();
  bedGain.gain.value = dbToGain(-22); // beds sit −18…−30 dB under music
  bedGain.connect(duckGain);

  const bedIn = ctx.createGain();
  bedIn.gain.value = 1;
  bedIn.connect(bedGain);

  const sfxIn = ctx.createGain();
  sfxIn.gain.value = 1;
  sfxIn.connect(compressor);

  // --- The one Convolver ---------------------------------------------------
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.35;
  const preDelay = ctx.createDelay(0.1);
  preDelay.delayTime.value = 0.02;
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulseResponse(ctx, 2.2);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.5;
  reverbSend.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(compressor);

  const graph: AudioGraph = {
    ctx,
    sampleRate: ctx.sampleRate,
    musicIn,
    moodLowpass,
    duckGain,
    bedIn,
    bedGain,
    sfxIn,
    reverbSend,
    reverbReturn,
    compressor,
    master,
    voices: { active: 0, max: 24 },
  };
  graphs.set(ctx, graph);
  return graph;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Reserve n oscillator voices; false = at budget, skip the note gracefully. */
export function acquireVoices(graph: AudioGraph, n: number): boolean {
  if (graph.voices.active + n > graph.voices.max) return false;
  graph.voices.active += n;
  return true;
}

export function releaseVoices(graph: AudioGraph, n: number): void {
  graph.voices.active = Math.max(0, graph.voices.active - n);
}

/**
 * Generated impulse response (AAA 8.4): decaying noise, decorrelated L/R,
 * 15ms fade-in, darkening tail (one-pole lowpass whose coefficient rises
 * through the tail). Built at ctx.sampleRate so it survives rate flips.
 */
function makeImpulseResponse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  const fadeIn = Math.floor(rate * 0.015);

  for (let ch = 0; ch < 2; ch++) {
    const rng = createRng(0xacc0 + ch * 7919); // decorrelated channels
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Exponential decay ≈ −60 dB across the tail.
      const env = Math.pow(10, -3 * t);
      // Darkening: lowpass smoothing factor grows with t (tail loses highs).
      const alpha = 0.12 + 0.6 * t;
      const white = rng() * 2 - 1;
      lp += (white - lp) * (1 - alpha);
      let s = lp * env;
      if (i < fadeIn) s *= i / fadeIn;
      data[i] = s;
    }
  }
  return buffer;
}
