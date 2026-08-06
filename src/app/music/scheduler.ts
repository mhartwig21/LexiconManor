/**
 * app/music/scheduler.ts — lookahead clock. OWNER: A8.
 *
 * The classic Web Audio pattern (AAA 8.11): a 25ms JS tick schedules every
 * event landing inside a 100ms horizon against ctx.currentTime, so the
 * musical clock stays metronomic under scroll/touch spam and rAF throttling.
 *
 * Pause on hidden; on resume every task is fast-forwarded to "now" so a
 * 5-minute background never produces an event-backlog burst (AAA 8.12).
 */

export interface ScheduledTask {
  /** Absolute ctx time this task next wants to fire. */
  nextAt: number;
  /** Schedule audio at `t` (>= now); return seconds until the next fire. */
  fire(t: number): number;
}

const TICK_MS = 25;
const HORIZON_S = 0.1;

export class Scheduler {
  private tasks = new Set<ScheduledTask>();
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private getCtx: () => AudioContext | null) {}

  add(task: ScheduledTask): () => void {
    const ctx = this.getCtx();
    if (ctx && task.nextAt < ctx.currentTime) task.nextAt = ctx.currentTime + 0.02;
    this.tasks.add(task);
    return () => this.tasks.delete(task);
  }

  start(): void {
    if (this.interval !== null) return;
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
  }

  get running(): boolean {
    return this.interval !== null;
  }

  /** Drop all pending fire times to now+ε — called on resume-from-hidden. */
  fastForward(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    let i = 0;
    for (const task of this.tasks) {
      if (task.nextAt < now) task.nextAt = now + 0.03 + i * 0.05;
      i++;
    }
  }

  clear(): void {
    this.tasks.clear();
  }

  private tick(): void {
    const ctx = this.getCtx();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const horizon = now + HORIZON_S;
    for (const task of this.tasks) {
      // A task may fire several times inside one horizon (fast patterns).
      let guard = 0;
      while (task.nextAt < horizon && guard++ < 8) {
        const at = Math.max(task.nextAt, now);
        const delta = Math.max(0.02, task.fire(at));
        task.nextAt = at + delta;
      }
    }
  }
}
