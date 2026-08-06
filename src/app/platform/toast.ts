/**
 * app/platform/toast.ts — OWNER: A8 (Platform).
 *
 * Minimal DOM toast for platform-level messages (SW update prompt, storage
 * warnings). Deliberately React-free: it must work even if the React tree is
 * wedged, and App.tsx is architect-frozen. Styled by platform.css tokens;
 * one toast at a time (platform messages are rare).
 */

export interface PlatformToastOpts {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'info' | 'warn';
  /** Auto-hide after ms; 0 = sticky until actioned. Default 8000. */
  timeoutMs?: number;
}

let el: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureEl(): HTMLDivElement {
  if (el && document.body.contains(el)) return el;
  el = document.createElement('div');
  el.className = 'platform-toast';
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  return el;
}

export function hidePlatformToast(): void {
  if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
  el?.classList.remove('is-shown');
}

export function showPlatformToast(opts: PlatformToastOpts): void {
  const node = ensureEl();
  node.classList.toggle('platform-toast--warn', opts.variant === 'warn');
  node.textContent = '';

  const text = document.createElement('span');
  text.textContent = opts.message;
  node.appendChild(text);

  if (opts.actionLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opts.actionLabel;
    btn.addEventListener('pointerdown', () => btn.classList.add('is-pressed'));
    btn.addEventListener('pointerup', () => btn.classList.remove('is-pressed'));
    btn.addEventListener('click', () => {
      hidePlatformToast();
      opts.onAction?.();
    });
    node.appendChild(btn);
  }

  // Double-rAF so the transition runs even on a freshly-created node.
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-shown')));

  if (hideTimer !== null) clearTimeout(hideTimer);
  const timeout = opts.timeoutMs ?? 8000;
  if (timeout > 0) {
    hideTimer = setTimeout(() => hidePlatformToast(), timeout);
  }
}
