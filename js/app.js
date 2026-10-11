// MalMetr — басты модуль: маршруттау, басты бет, тақырып, PWA орнату
import { db } from './db.js';
import { ensureModels, getActiveModel } from './models.js';
import { ICONS, esc, toast, openSheet, num } from './ui.js';
import { renderScanner, pickPhoto } from './scanner.js';
import { renderMeasure } from './measure.js';
import { renderModel, renderBuilder } from './modelview.js';
import { renderLab, renderResults, renderRecord } from './lab.js';
import { renderDefense } from './defense.js';
import { detector } from './ai/detector.js';

const view = document.getElementById('view');
const TITLES = {
  home: 'MalMetr', scan: 'Сканер', measure: 'Өлшеу', model: 'Математикалық модель', builder: 'Модель құрастыру',
  lab: 'Зерттеу зертханасы', results: 'Нәтижелер', record: 'Өлшеу нәтижесі', defense: 'Жобаны қорғау', install: 'Орнату',
};
const TABS = { home: 'home', scan: 'scan', model: 'model', builder: 'model', lab: 'lab', results: 'results', record: 'results', measure: 'scan' };
const SUBPAGES = new Set(['measure', 'builder', 'record', 'defense', 'install']);

let cleanup = null;
let renderToken = 0;
let deferredInstall = null;

const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

async function route() {
  const token = ++renderToken;
  const [, name = 'home', arg] = (location.hash || '#/home').match(/^#\/([^/?]+)\/?([^?]*)/) || [];
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  document.body.classList.remove('immersive');
  view.classList.remove('fullbleed');
  view.innerHTML = '';
  document.getElementById('topbarTitle').textContent = TITLES[name] || 'MalMetr';
  document.getElementById('backBtn').hidden = !SUBPAGES.has(name);
  document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (TABS[name] || '')));
  view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
  window.scrollTo(0, 0);

  let c;
  try {
    switch (name) {
      case 'scan': c = renderScanner(view, go); break;
      case 'measure': c = await renderMeasure(view, go); break;
      case 'model': c = await renderModel(view, go); break;
      case 'builder': c = await renderBuilder(view, go); break;
      case 'lab': c = await renderLab(view, go); break;
      case 'results': c = await renderResults(view, go); break;
      case 'record': c = await renderRecord(view, go, decodeURIComponent(arg)); break;
      case 'defense': c = await renderDefense(view, go); break;
      case 'install': c = await renderInstall(view); break;
      default: c = await renderHome(view);
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><h3>Қате орын алды</h3><p class="muted">${esc(e.message)}</p><a class="btn" href="#/home">Басты бет</a></div>`;
  }
  if (token !== renderToken) { if (typeof c === 'function') c(); return; }
  cleanup = typeof c === 'function' ? c : null;
}

// ---------- Басты бет ----------
async function renderHome(v) {
  const model = await getActiveModel();
  const recs = await db.getAll('records');
  const installed = isStandalone();
  v.innerHTML = `
    <section class="hero">
      <svg class="grid-bg" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#fff" stroke-width=".6"/></pattern></defs>
        <rect width="400" height="200" fill="url(#g)"/>
        <path d="M250 150 L250 40 M240 40 H260 M240 150 H260" stroke="#7FE6DA" stroke-width="2.5" fill="none"/>
        <path d="M280 120 C280 95 300 82 330 82 C360 82 385 96 385 118 C385 136 365 146 340 146 L300 146 C288 146 280 136 280 120Z" fill="none" stroke="#fff" stroke-width="2"/>
      </svg>
      <div class="eyebrow">Ғылыми жоба · цифрлық өнім</div>
      <h1>MALMETR</h1>
      <p>Қой салмағын жанаспай анықтау</p>
    </section>

    <div class="tiles">
      <a class="tile primary" href="#/scan">
        <span class="ic">${ICONS.scan}</span>
        <span><b>ҚОЙДЫ СКАНЕРЛЕУ</b><small>Камера → масштаб → өлшем → салмақ</small></span>
      </a>
      <button class="tile wide" id="hPhoto"><span class="ic">${ICONS.photo}</span><span><b>ФОТО АРҚЫЛЫ ӨЛШЕУ</b><small class="muted">Галереядағы дайын сурет бойынша</small></span></button>
      <a class="tile" href="#/model"><span class="ic">${ICONS.model}</span><b>МАТЕМАТИКАЛЫҚ МОДЕЛЬ</b></a>
      <a class="tile" href="#/lab"><span class="ic">${ICONS.lab}</span><b>ЗЕРТТЕУ ЗЕРТХАНАСЫ</b></a>
      <a class="tile" href="#/results"><span class="ic">${ICONS.results}</span><b>НӘТИЖЕЛЕР</b></a>
      <a class="tile" href="#/defense"><span class="ic">${ICONS.defense}</span><b>ЖОБАНЫ ҚОРҒАУ</b></a>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-row" style="justify-content:space-between">
        <div><div class="label">Белсенді модель</div><b>${esc(model.name)}</b></div>
        <span class="badge warn">модельдік</span>
      </div>
      <div class="divider"></div>
      <div class="card-row" style="justify-content:space-between">
        <div><div class="label">Сақталған өлшеулер</div><b class="num">${recs.length}</b> <span class="small muted">· нақты салмақпен: ${recs.filter(r => r.actual != null).length}</span></div>
      </div>
    </div>

    <div class="card" id="aiHome"></div>

    ${installed ? '' : `
    <a class="card card-row" href="#/install" style="text-decoration:none;color:inherit">
      <span class="ic" style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--surface-2);color:var(--primary)">${ICONS.install}</span>
      <span style="flex:1"><b>Телефонға орнату</b><br><span class="small muted">Басты экранға қосып, интернетсіз пайдаланыңыз</span></span>
      ${ICONS.arrow}
    </a>`}

    <div class="card flat">
      <h3>Қалай өлшейміз?</h3>
      <ol class="small" style="margin:0;padding-left:18px">
        <li>Қойдың қасына ұзындығы белгілі тік рейка қойыңыз (мысалы, 100 см).</li>
        <li>Қойды қырынан, рейкамен бірге толық кадрға түсіріңіз.</li>
        <li>Рейканың екі ұшын белгілеп, масштабты табыңыз.</li>
        <li>Дененің 6 нүктесін белгілеңіз — H, L, D есептеледі.</li>
        <li>Модель бойынша болжамды салмақты алыңыз.</li>
      </ol>
    </div>`;
  v.querySelector('#hPhoto').onclick = () => pickPhoto(go);
  const aiCard = v.querySelector('#aiHome');
  let prog = 0;
  async function drawAI() {
    const st = detector.state;
    const enabled = await detector.isEnabled();
    aiCard.innerHTML = `
      <div class="card-row" style="justify-content:space-between;margin-bottom:6px">
        <h3 style="margin:0">AI көмекші</h3>
        <span class="badge ${st === 'ready' ? 'ok' : st === 'error' ? 'warn' : ''}">${st === 'ready' ? 'қосулы' : st === 'loading' ? 'жүктелуде' : st === 'error' ? 'қате' : enabled ? 'қосулы' : 'өшірулі'}</span>
      </div>
      <p class="small muted">Камерада қойды тауып, суретте силуэтін бөледі және өлшеу нүктелерін ұсынады. Нүктелерді әрқашан өзіңіз тексересіз.</p>
      ${st === 'loading' ? `<div style="height:8px;border-radius:6px;background:var(--surface-2);overflow:hidden;margin-bottom:6px"><i id="aiHomeBar" style="display:block;height:100%;width:${Math.round(prog * 100)}%;background:var(--accent)"></i></div>` : ''}
      ${st === 'error' ? `<div class="note">${esc(detector.error)}</div>` : ''}
      ${st === 'ready' || (enabled && st !== 'error')
        ? `<button class="btn sm" id="aiToggle">AI көмекшіні өшіру</button>`
        : `<button class="btn primary block" id="aiToggle" ${st === 'loading' ? 'disabled' : ''}>Қосу · модельді жүктеу (≈11 МБ)</button>`}`;
    const b = aiCard.querySelector('#aiToggle');
    if (b) b.onclick = async () => {
      if (detector.state === 'ready' || (await detector.isEnabled() && detector.state !== 'error')) { await detector.disable(); drawAI(); return; }
      const ok = await detector.enable(f => { prog = f; const bar = aiCard.querySelector('#aiHomeBar'); if (bar) bar.style.width = Math.round(f * 100) + '%'; });
      toast(ok ? 'AI көмекші дайын' : 'Модельді жүктеу мүмкін болмады', 3000);
    };
  }
  drawAI();
  const unsub = detector.onChange(drawAI);
  return () => unsub();
}

// ---------- Орнату ----------
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

async function renderInstall(v) {
  const url = location.origin + location.pathname;
  let qr = '';
  try {
    if (window.qrcode && location.protocol === 'https:') {
      const q = window.qrcode(0, 'M'); q.addData(url); q.make();
      qr = `<div class="qr-box"><img src="${q.createDataURL(6, 2)}" alt="Қосымша сілтемесінің QR-коды"></div><p class="small muted mono" style="text-align:center;word-break:break-all">${esc(url)}</p>`;
    }
  } catch {}
  v.innerHTML = `
    <div class="eyebrow">Орнату</div>
    <h2 style="margin-bottom:12px">MalMetr-ді телефонға орнату</h2>
    ${isStandalone() ? '<div class="note info">Қосымша орнатылған және басты экраннан ашылған.</div>' : ''}
    <div class="card">
      <h3>Android (Chrome, Samsung Internet, т.б.)</h3>
      ${deferredInstall ? `<button class="btn primary block" id="iBtn">${ICONS.install} Орнату</button>` :
      `<ol class="small" style="padding-left:18px;margin:0">
        <li>Браузер мәзірін ашыңыз (⋮).</li>
        <li>«Қосымшаны орнату» немесе «Басты экранға қосу» таңдаңыз.</li>
        <li>Растаңыз — MalMetr белгішесі басты экранда пайда болады.</li>
      </ol>`}
    </div>
    <div class="card">
      <h3>iPhone / iPad (Safari)</h3>
      <ol class="small" style="padding-left:18px;margin:0">
        <li>Сілтемені <b>Safari</b> браузерінде ашыңыз.</li>
        <li>Төмендегі «Бөлісу» батырмасын басыңыз (жоғары көрсеткісі бар шаршы).</li>
        <li>«Басты экранға қосу» («На экран Домой» / «Add to Home Screen») таңдаңыз.</li>
        <li>«Қосу» батырмасын басыңыз.</li>
      </ol>
      ${isIOS() ? '<p class="small muted" style="margin-top:8px">Сіз iPhone/iPad қолданып отырсыз — осы нұсқаулықты орындаңыз.</p>' : ''}
    </div>
    <div class="card">
      <h3>Сілтемемен бөлісу</h3>
      ${qr || '<p class="small muted">QR-код қосымша HTTPS мекенжайында ашылғанда көрсетіледі.</p>'}
    </div>
    <div class="note">Орнату терезесінің түрі телефон мен браузерге байланысты әртүрлі болады. Камера тек HTTPS арқылы ашылған жағдайда жұмыс істейді.</div>`;
  const b = v.querySelector('#iBtn');
  if (b) b.onclick = async () => {
    deferredInstall.prompt();
    const r = await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    if (r && r.outcome === 'accepted') toast('Орнатылды');
    renderInstall(v);
  };
}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast('MalMetr орнатылды'); });

// ---------- Тақырып ----------
function effectiveDark() {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function syncThemeColor() {
  document.querySelector('meta[name="theme-color"]').setAttribute('content', effectiveDark() ? '#06101E' : '#0B1F3A');
}
document.getElementById('themeBtn').onclick = () => {
  const next = effectiveDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('malmetr-theme', next); } catch {}
  syncThemeColor();
  route();
};
document.getElementById('backBtn').onclick = () => { if (history.length > 1) history.back(); else go('#/home'); };

// ---------- Service worker ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Жаңа нұсқа жүктелді — қосымшаны қайта ашыңыз', 4000);
        });
      });
    }).catch(err => console.warn('SW тіркелмеді', err));
  });
}

window.addEventListener('hashchange', route);
syncThemeColor();
ensureModels().then(route).catch(e => {
  view.innerHTML = `<div class="card"><h3>Деректер қоймасы ашылмады</h3><p class="muted">${esc(e.message)}. Браузердің жеке (инкогнито) режимін өшіріп көріңіз.</p></div>`;
});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
