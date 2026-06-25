/**
 * Glossary — jargon → plain-English definitions, surfaced as click-to-define
 * tooltips on `.glossary-link[data-term]` spans.
 */

export const GLOSSARY: Record<string, { title: string; body: string }> = {
  fps: {
    title: 'Frame rate (fps)',
    body: 'How many still frames the GIF shows each second. Higher looks smoother but makes a bigger file. 12–15 is a good balance for most clips.',
  },
  scale: {
    title: 'Width / scaling',
    body: 'GIFs get heavy fast, so shrinking the width keeps the file small. Height is adjusted automatically to keep the aspect ratio. gifsmith never upscales.',
  },
  palette: {
    title: 'Palette',
    body: 'A GIF frame can use at most 256 distinct colours. The set chosen for a frame is its palette. Fewer colours = smaller file but more banding.',
  },
  quantize: {
    title: 'Quantize',
    body: 'Reducing a full-colour frame (millions of colours) down to the GIF palette by picking the most representative colours and mapping every pixel to the nearest one.',
  },
  loop: {
    title: 'Loop',
    body: 'GIFs can repeat forever, a set number of times, or play once. gifsmith loops forever by default — the classic GIF behaviour.',
  },
};

let tooltipEl: HTMLElement | null = null;

/** Wire up click-to-define behaviour on the whole document. */
export function initGlossary(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLElement>('.glossary-link');
    if (link) {
      e.preventDefault();
      const term = link.dataset.term;
      if (term && GLOSSARY[term]) showTooltip(link, term);
      return;
    }
    // Click elsewhere dismisses.
    if (tooltipEl && !target.closest('.glossary-tooltip')) hideTooltip();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTooltip();
  });

  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
}

function showTooltip(anchor: HTMLElement, term: string): void {
  hideTooltip();
  const def = GLOSSARY[term];
  const el = document.createElement('div');
  el.className = 'glossary-tooltip';
  el.setAttribute('role', 'tooltip');
  el.innerHTML = `<strong>${def.title}</strong><span>${def.body}</span>`;
  document.body.appendChild(el);

  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + 8;
  let left = rect.left;
  // Keep it on screen.
  const maxLeft = window.innerWidth - el.offsetWidth - 12;
  if (left > maxLeft) left = Math.max(12, maxLeft);
  el.style.top = `${top + window.scrollY}px`;
  el.style.left = `${left + window.scrollX}px`;

  tooltipEl = el;
}

function hideTooltip(): void {
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
  }
}
