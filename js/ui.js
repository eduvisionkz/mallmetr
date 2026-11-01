// Ортақ интерфейс көмекшілері
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Сандарды қазақша пішімдеу: ондық бөлгіш — үтір
export function num(x, d = 1) {
  if (x == null || !Number.isFinite(Number(x))) return '—';
  return Number(x).toFixed(d).replace('.', ',').replace('-', '−');
}
export function parseNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.').replace('−', '-');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function dateStr(iso) {
  try {
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

let toastTimer;
export function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

let sheetClose = null;
export function openSheet(html, onMount) {
  const sheet = $('#sheet'), back = $('#sheetBackdrop'), body = $('#sheetBody');
  body.innerHTML = html;
  sheet.hidden = false; back.hidden = false;
  const close = () => { sheet.hidden = true; back.hidden = true; body.innerHTML = ''; back.onclick = null; sheetClose = null; };
  back.onclick = close;
  sheetClose = close;
  $$('[data-close]', body).forEach(b => b.addEventListener('click', close));
  if (onMount) onMount(body, close);
  return close;
}
export function closeSheet() { if (sheetClose) sheetClose(); }

export function confirmSheet(title, text, okLabel = 'Иә', danger = false) {
  return new Promise(resolve => {
    let answered = false;
    openSheet(`
      <h2>${esc(title)}</h2>
      <p class="muted">${esc(text)}</p>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn" data-no>Бас тарту</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button>
      </div>`, (body, close) => {
      body.querySelector('[data-no]').onclick = () => { answered = true; close(); resolve(false); };
      body.querySelector('[data-yes]').onclick = () => { answered = true; close(); resolve(true); };
      $('#sheetBackdrop').onclick = () => { close(); if (!answered) resolve(false); };
    });
  });
}

export function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const ICONS = {
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3.2"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  model: '<svg viewBox="0 0 24 24"><path d="M5 19L19 5M7 5h4M9 3v4M14 17h5M5 14l4 4M9 14l-4 4"/></svg>',
  lab: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 15h9"/></svg>',
  results: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  defense: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4M7 12l3-3 2 2 4-4"/></svg>',
  builder: '<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  zoomIn: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg>',
  fit: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  flip: '<svg viewBox="0 0 24 24"><path d="M3 7h13l-3-3M21 17H8l3 3"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 3v5h7M8 21v-7h8v7"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 20V9M7 14l5-5 5 5M5 4h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  install: '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3M10 18h4"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
  ruler: '<svg viewBox="0 0 24 24"><path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/></svg>',
};
