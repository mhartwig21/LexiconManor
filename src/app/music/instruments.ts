/**
 * app/music/instruments.ts — warm procedural timbres. OWNER: A8.
 *
 * Fresh nodes per note (long-lived AudioParams are never reused); anti-click
 * ramps on every gain; every stop() lands ≥30ms after the release tail
 * (AAA 8.3). Voice budget honored via graph.acquireVoices.
 *
 *  - FM piano (AAA 8.1): 1:1 carrier/mod pair; brightness (mod index)
 *    decays 4–6× faster than amplitude; soft velocity = darker, not just
 *    quieter (index scales with velocity²).
 *  - Additive celesta / music box (AAA 8.2): inharmonic partials at
 *    ≈2.76 / 5.4 / 8.9 ratios, decays 0.15–1.2s, only above ~C5.
 *  - Noise transients (clock tick, key thock) from short generated buffers.
 */

import { acquireVoices, releaseVoices, type AudioGraph } from './graph';
import { midiToFreq, C5 } from './theory';
import { createRng } from '../../engine/rng';

export interface NoteOpts {
  midi: number;
  when: number;          // absolute ctx time
  velocity?: number;     // 0..1
  duration?: number;     // seconds to the start of release
  send?: number;         // 0..1 reverb send level
  dest?: AudioNode;      // default graph.musicIn
}

const STOP_PAD = 0.05; // ≥30ms after release tail (AAA 8.3)

function envGain(ctx: AudioContext, when: number, peak: number, attack: number, decayTo: number, decayTime: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(decayTo, 0.0001), when + attack + decayTime);
  return g;
}

function wireSend(graph: AudioGraph, from: AudioNode, level: number): void {
  if (level <= 0) return;
  const s = graph.ctx.createGain();
  s.gain.value = level;
  from.connect(s);
  s.connect(graph.reverbSend);
}

/** FM piano voice: 2 oscillators. Returns false if the voice budget is full. */
export function pianoNote(graph: AudioGraph, opts: NoteOpts): boolean {
  if (!acquireVoices(graph, 2)) return false;
  const { ctx } = graph;
  const when = Math.max(opts.when, ctx.currentTime);
  const vel = Math.min(1, Math.max(0.05, opts.velocity ?? 0.7));
  const dur = opts.duration ?? 2.4;
  const freq = midiToFreq(opts.midi);

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = freq; // 1:1 body pair

  // Brightness: modulation index in Hz. Velocity² keeps soft notes dark.
  const index = freq * (0.4 + 1.8 * vel * vel);
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(index, when);
  // Brightness decays ~5× faster than amplitude (AAA 8.1).
  modGain.gain.exponentialRampToValueAtTime(index * 0.02, when + dur / 5);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const amp = envGain(ctx, when, 0.16 * vel, 0.004, 0.0001, dur);
  carrier.connect(amp);
  amp.connect(opts.dest ?? graph.musicIn);
  wireSend(graph, amp, opts.send ?? 0.25);

  const stopAt = when + 0.004 + dur + STOP_PAD;
  carrier.start(when);
  mod.start(when);
  carrier.stop(stopAt);
  mod.stop(stopAt);
  carrier.addEventListener('ended', () => releaseVoices(graph, 2));
  return true;
}

/** Inharmonic partial set for the celesta / music-box voice. */
const CELESTA_PARTIALS = [
  { ratio: 1, amp: 1.0, decay: 1.2 },
  { ratio: 2.76, amp: 0.35, decay: 0.6 },
  { ratio: 5.4, amp: 0.16, decay: 0.3 },
  { ratio: 8.9, amp: 0.08, decay: 0.15 },
] as const;

/** Additive celesta: 4 oscillators, only above ~C5. */
export function celestaNote(graph: AudioGraph, opts: NoteOpts): boolean {
  const midi = Math.max(opts.midi, C5);
  if (!acquireVoices(graph, CELESTA_PARTIALS.length)) return false;
  const { ctx } = graph;
  const when = Math.max(opts.when, ctx.currentTime);
  const vel = Math.min(1, Math.max(0.05, opts.velocity ?? 0.6));
  const base = midiToFreq(midi);
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(opts.dest ?? graph.musicIn);
  wireSend(graph, out, opts.send ?? 0.4);

  let longest = 0;
  let remaining = CELESTA_PARTIALS.length;
  for (const p of CELESTA_PARTIALS) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base * p.ratio;
    const amp = envGain(ctx, when, 0.09 * vel * p.amp, 0.002, 0.0001, p.decay);
    osc.connect(amp);
    amp.connect(out);
    const stopAt = when + 0.002 + p.decay + STOP_PAD;
    longest = Math.max(longest, p.decay);
    osc.start(when);
    osc.stop(stopAt);
    osc.addEventListener('ended', () => {
      releaseVoices(graph, 1);
      remaining -= 1;
      if (remaining === 0) out.disconnect();
    });
  }
  return true;
}

// --- Noise transients -------------------------------------------------------

let tickBuffer: AudioBuffer | null = null;
let tickBufferRate = 0;

function getTickBuffer(ctx: AudioContext): AudioBuffer {
  if (tickBuffer && tickBufferRate === ctx.sampleRate) return tickBuffer;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * 0.03);
  const buf = ctx.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  const rng = createRng(0x71c);
  for (let i = 0; i < len; i++) {
    const env = Math.pow(1 - i / len, 3);
    data[i] = (rng() * 2 - 1) * env;
  }
  tickBuffer = buf;
  tickBufferRate = rate;
  return buf;
}

/** Short filtered noise burst: clock ticks, droplets, crackle grains. */
export function noiseTransient(
  graph: AudioGraph,
  opts: { when: number; gainDb: number; filterHz: number; filterType?: BiquadFilterType; dest?: AudioNode; playbackRate?: number },
): void {
  const { ctx } = graph;
  const when = Math.max(opts.when, ctx.currentTime);
  const src = ctx.createBufferSource();
  src.buffer = getTickBuffer(ctx);
  src.playbackRate.value = opts.playbackRate ?? 1;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType ?? 'bandpass';
  filter.frequency.value = opts.filterHz;
  filter.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.value = Math.pow(10, opts.gainDb / 20);
  src.connect(filter);
  filter.connect(g);
  g.connect(opts.dest ?? graph.bedIn);
  src.start(when);
}
