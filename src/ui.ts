/**
 * UI helpers — DOM construction, the modal system, the status bar, and a
 * small reusable progress component. Screen composition lives in main.ts.
 */

type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined;

/** Tiny hyperscript helper. */
export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function mount(): HTMLElement {
  const el = document.getElementById('app');
  if (!el) throw new Error('#app not found');
  return el;
}

// ---------- modal ----------

export function openModal(content: DocumentFragment | HTMLElement): void {
  const closeBtn = h('button', { class: 'modal-close', type: 'button', 'aria-label': 'close' }, '×');
  const panel = h('div', { class: 'modal-panel', role: 'document' }, closeBtn);
  panel.appendChild(content as unknown as Node);
  const overlay = h('div', { class: 'modal-overlay', role: 'dialog', 'aria-modal': 'true' }, panel);

  const previouslyFocused = document.activeElement as HTMLElement | null;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const close = () => {
    overlay.remove();
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
    previouslyFocused?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => closeBtn.focus());
}

export function initModalTriggers(): void {
  document.querySelectorAll<HTMLElement>('[data-modal]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const id = trigger.dataset.modal;
      if (!id) return;
      const tmpl = document.getElementById(id) as HTMLTemplateElement | null;
      if (!tmpl) return;
      openModal(tmpl.content.cloneNode(true) as DocumentFragment);
    });
  });
}

// ---------- status bar ----------

type StatusKind = 'idle' | 'busy' | 'ok' | 'err';

export function setStatus(label: string, kind: StatusKind = 'idle', detail = ''): void {
  const dot = document.getElementById('sb-status-dot');
  const lbl = document.getElementById('sb-status-label');
  const det = document.getElementById('sb-detail');
  if (dot) dot.className = `dot-mini ${kind}`;
  if (lbl) lbl.textContent = label;
  if (det) det.textContent = detail;
}

// ---------- progress component ----------

export interface ProgressHandle {
  el: HTMLElement;
  set(fraction: number, label?: string): void;
}

export function createProgress(initialLabel = ''): ProgressHandle {
  const fill = h('div', { class: 'progress-fill' });
  const bar = h('div', { class: 'progress-track' }, fill);
  const label = h('div', { class: 'progress-label' }, initialLabel);
  const pct = h('div', { class: 'progress-pct' }, '0%');
  const head = h('div', { class: 'progress-head' }, label, pct);
  const el = h('div', { class: 'progress' }, head, bar);
  return {
    el,
    set(fraction: number, newLabel?: string) {
      const clamped = Math.max(0, Math.min(1, fraction));
      fill.style.width = `${(clamped * 100).toFixed(1)}%`;
      pct.textContent = `${Math.round(clamped * 100)}%`;
      if (newLabel !== undefined) label.textContent = newLabel;
    },
  };
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename }) as HTMLAnchorElement;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
