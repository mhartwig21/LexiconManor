/**
 * app/music/director.ts — the ONLY music module that knows the game. OWNER: A8.
 *
 * Subscribes to store selectors + the GameEvent stream and maps
 * {dayPhase, steps band, room category/kind, sanctum proximity} → RoomMood
 * presets. Mood changes are parameter crossfades over 1.5–3s
 * (setTargetAtTime); scale/chord changes land only at the next natural chord
 * boundary — never a hard cut or retriggered note (AAA 8.8).
 *
 * Audio is never load-bearing (R.4): if the context never unlocks, this whole
 * module idles silently and the game is complete.
 */

import { useManorStore } from '../store';
import {
  armUnlock, currentContext, onAudioResume, onAudioSuspend, onContextReady,
  onContextTeardown, applyAudioSessionPolicy,
} from './context';
import { buildAudioGraph, type AudioGraph } from './graph';
import { Scheduler, type ScheduledTask } from './scheduler';
import {
  SCALES, type ScaleName, initialChord, nextChord, nextMelodyNote, topVoice, type Chord,
} from './theory';
import { pianoNote, celestaNote } from './instruments';
import { Beds, type BedMix } from './beds';
import { densityFactor } from './duck';
import { STEPS_LOW_AT } from '../../engine/economy/steps';
import { createRng, type Rng } from '../../engine/rng';


export interface RoomMood {
  scale: ScaleName;
  root: number;             // midi
  density: number;          // 0..1 melody-note probability
  brightness: number;       // moodLowpass Hz
  register: [number, number]; // melody range (midi)
  celestaLead: boolean;     // violet-room tell (AAA 8.10)
  reverbSendLevel: number;  // 0..1
  bedMix: BedMix;
  harmonicRhythm: [number, number]; // seconds between chords (8–16s band)
}

const MOODS: Record<string, RoomMood> = {
  morning: {
    scale: 'ionian', root: 62, density: 0.5, brightness: 2600, register: [64, 84],
    celestaLead: false, reverbSendLevel: 0.3, bedMix: { rain: 0.1, fire: 0.5, clock: 0.6 },
    harmonicRhythm: [8, 12],
  },
  exploring: {
    scale: 'dorian', root: 62, density: 0.38, brightness: 2100, register: [62, 81],
    celestaLead: false, reverbSendLevel: 0.35, bedMix: { rain: 0.25, fire: 0.15, clock: 0 },
    harmonicRhythm: [9, 14],
  },
  puzzle: {
    scale: 'mixolydian', root: 60, density: 0.3, brightness: 1900, register: [60, 79],
    celestaLead: false, reverbSendLevel: 0.3, bedMix: { rain: 0.2, fire: 0.1, clock: 0 },
    harmonicRhythm: [10, 16],
  },
  conservatory: {
    scale: 'ionian', root: 65, density: 0.42, brightness: 2500, register: [65, 86],
    celestaLead: false, reverbSendLevel: 0.4, bedMix: { rain: 0.5, fire: 0, clock: 0 },
    harmonicRhythm: [8, 13],
  },
  parlor: {
    scale: 'ionian', root: 60, density: 0.45, brightness: 2300, register: [60, 81],
    celestaLead: false, reverbSendLevel: 0.28, bedMix: { rain: 0.1, fire: 0.6, clock: 0.3 },
    harmonicRhythm: [8, 12],
  },
  mystery: {
    scale: 'lydian', root: 63, density: 0.34, brightness: 2400, register: [72, 93],
    celestaLead: true, reverbSendLevel: 0.55, bedMix: { rain: 0.15, fire: 0, clock: 0 },
    harmonicRhythm: [10, 16],
  },
  sanctum: {
    scale: 'lydian', root: 58, density: 0.26, brightness: 1700, register: [70, 91],
    celestaLead: true, reverbSendLevel: 0.6, bedMix: { rain: 0.1, fire: 0, clock: 0.4 },
    harmonicRhythm: [12, 16],
  },
  dusk: {
    scale: 'aeolian', root: 57, density: 0.22, brightness: 1300, register: [57, 76],
    celestaLead: false, reverbSendLevel: 0.45, bedMix: { rain: 0.3, fire: 0.25, clock: 0 },
    harmonicRhythm: [12, 16],
  },
  night: {
    scale: 'aeolian', root: 57, density: 0.16, brightness: 1100, register: [72, 90],
    celestaLead: true, reverbSendLevel: 0.55, bedMix: { rain: 0.35, fire: 0.35, clock: 0.5 },
    harmonicRhythm: [12, 16],
  },
};

/** Pure mood pick — exported for tests. */
export function pickMoodKey(s: {
  phase: string | null;
  activeRoomKind: string | null;
  activeRoomCategory: string | null;
  playerRow: number;
  stepsLow: boolean;
}): string {
  if (s.phase === 'dusk') return 'dusk';
  if (s.phase === 'night') return 'night';
  if (s.phase === 'morning') return 'morning';
  if (s.activeRoomCategory === 'mystery') return 'mystery';
  if (s.activeRoomCategory === 'parlor') return 'parlor';
  if (s.activeRoomKind === 'hive') return 'conservatory';
  if (s.activeRoomKind) return 'puzzle';
  if (s.playerRow >= 5) return 'sanctum';
  if (s.stepsLow) return 'dusk';
  return 'exploring';
}

class Director {
  private graph: AudioGraph | null = null;
  private scheduler = new Scheduler(() => currentContext());
  private beds = new Beds();
  private rng: Rng = createRng((Date.now() & 0xffff) ^ 0x50e7);
  private moodKey = 'exploring';
  private mood: RoomMood = MOODS.exploring!;
  private pendingMood: RoomMood | null = null; // applied at next chord boundary
  private chord: Chord | null = null;
  private melodyPrev = 72;
  private removers: Array<() => void> = [];
  private storeUnsub: (() => void) | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    armUnlock();

    this.removers.push(
      onContextReady((ctx) => this.onReady(ctx)),
      onAudioSuspend(() => this.scheduler.stop()),
      onAudioResume(() => {
        this.scheduler.fastForward();
        if (this.enabled()) this.scheduler.start();
      }),
      onContextTeardown(() => {
        this.scheduler.stop();
        this.scheduler.clear();
        this.beds.stop();
        this.graph = null;
        this.chord = null;
      }),
    );

    this.storeUnsub = useManorStore.subscribe(() => this.syncFromStore());
    this.syncFromStore();
  }

  stop(): void {
    this.started = false;
    this.scheduler.stop();
    this.scheduler.clear();
    this.beds.stop();
    for (const r of this.removers) r();
    this.removers = [];
    this.storeUnsub?.();
    this.storeUnsub = null;
  }

  private enabled(): boolean {
    const s = useManorStore.getState();
    return s.settings.soundEnabled && s.settings.musicEnabled;
  }

  private onReady(ctx: AudioContext): void {
    if (!this.enabled()) return;
    if (!this.graph || this.graph.ctx !== ctx) {
      this.graph = buildAudioGraph(ctx);
      this.chord = initialChord(this.mood.root, SCALES[this.mood.scale]);
      this.beds.start(this.graph);
      this.beds.setMix(this.mood.bedMix, 1.5);
      this.installTasks();
    }
    this.scheduler.start();
  }

  private installTasks(): void {
    this.scheduler.clear();
    const chordTask: ScheduledTask = {
      nextAt: 0,
      fire: (t) => this.fireChord(t),
    };
    const melodyTask: ScheduledTask = {
      nextAt: 0,
      fire: (t) => this.fireMelody(t),
    };
    const bedTask: ScheduledTask = {
      nextAt: 0,
      fire: (t) => this.beds.sprinkle(t),
    };
    this.scheduler.add(chordTask);
    this.scheduler.add(melodyTask);
    this.scheduler.add(bedTask);
  }

  /** Chord boundary — ALSO the only place a pending mood's key change lands. */
  private fireChord(t: number): number {
    const g = this.graph;
    if (!g) return 4;
    if (this.pendingMood) {
      this.mood = this.pendingMood;
      this.pendingMood = null;
      this.chord = null; // re-seat in the new key, voice-led from melodyPrev
    }
    const scale = SCALES[this.mood.scale];
    this.chord = this.chord
      ? nextChord(this.rng, this.mood.root, scale, this.chord)
      : initialChord(this.mood.root, scale, Math.min(66, this.mood.register[0] + 4));

    // Low, soft pad: chord tones as gentle piano, slight strum.
    let i = 0;
    for (const midi of this.chord.midis) {
      pianoNote(g, {
        midi, when: t + i * 0.06, velocity: 0.32 + this.rng() * 0.08,
        duration: 5 + this.rng() * 2, send: this.mood.reverbSendLevel,
      });
      i++;
    }
    const [lo, hi] = this.mood.harmonicRhythm;
    return lo + this.rng() * (hi - lo);
  }

  private fireMelody(t: number): number {
    const g = this.graph;
    const chord = this.chord;
    if (!g || !chord) return 0.5;
    const gate = this.mood.density * densityFactor();
    if (this.rng() < gate) {
      const [lo, hi] = this.mood.register;
      const midi = nextMelodyNote(this.rng, this.melodyPrev, chord, this.mood.root, SCALES[this.mood.scale], lo, hi);
      this.melodyPrev = midi;
      const vel = 0.35 + this.rng() * 0.3;
      if (this.mood.celestaLead) {
        celestaNote(g, { midi: Math.max(midi, 72), when: t, velocity: vel, send: this.mood.reverbSendLevel });
      } else {
        pianoNote(g, { midi, when: t, velocity: vel, duration: 1.6 + this.rng(), send: this.mood.reverbSendLevel });
      }
    }
    // Incommensurable-feeling pulse: jittered, never grid-locked.
    return 0.34 + this.rng() * 0.55;
  }

  private syncFromStore(): void {
    const s = useManorStore.getState();
    applyAudioSessionPolicy(s.settings.muteSwitchBypass);

    if (!this.enabled()) {
      if (this.scheduler.running) {
        this.scheduler.stop();
        this.beds.setMix({ rain: 0, fire: 0, clock: 0 }, 0.5);
      }
      return;
    }
    if (this.graph && !this.scheduler.running && currentContext()?.state === 'running') {
      this.beds.setMix(this.mood.bedMix, 1.5);
      this.scheduler.start();
    }

    const active = s.day?.activeRoom ?? null;
    const category = active ? s.manor?.rooms[active.cellKey]?.kind ?? null : null;
    const key = pickMoodKey({
      phase: s.day?.phase ?? null,
      activeRoomKind: active?.kind ?? null,
      activeRoomCategory: category === 'mystery' || category === 'parlor' || category === 'utility' ? category : null,
      playerRow: s.manor?.playerCell.row ?? 0,
      stepsLow: s.stepsRemaining() <= STEPS_LOW_AT && s.day != null,
    });
    if (key === this.moodKey) return;
    this.moodKey = key;
    const mood = MOODS[key] ?? MOODS.exploring!;

    // Continuous params crossfade NOW (1.5–3s); key/scale waits for the
    // next chord boundary (retune at natural fire time — AAA 8.8).
    this.pendingMood = mood;
    const g = this.graph;
    if (g) {
      const now = g.ctx.currentTime;
      g.moodLowpass.frequency.setTargetAtTime(mood.brightness, now, 0.7);
      g.reverbSend.gain.setTargetAtTime(0.25 + mood.reverbSendLevel * 0.3, now, 0.7);
      this.beds.setMix(mood.bedMix, 2.5);
    }
    // Density/register apply immediately (read at each melody fire).
    this.mood = { ...this.mood, density: mood.density, register: mood.register, celestaLead: mood.celestaLead };
  }
}

let director: Director | null = null;

/** Idempotent bootstrap — safe to call once from main.tsx. */
export function startMusicDirector(): void {
  if (!director) director = new Director();
  director.start();
}

export function stopMusicDirector(): void {
  director?.stop();
}
