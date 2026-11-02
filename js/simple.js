// Қарапайым режим: басты бет, «L және D арқылы есептеу», «Фотоға түсіру» нәтижесі
import { K, predictMass, implausible, outsideStudy, MODEL_CAPTION } from './edilbay.js';
import { session, loadImage } from './session.js';
import { Viewer } from './viewer.js';
import { detector } from './ai/detector.js';
import { autoMeasure, reevaluateHead, withManualRod, onlyRodFailed, FAIL_MSG } from './ai/automeasure.js';
import { POINT } from './geometry.js';
import { db } from './db.js';
import { esc, num, parseNum } from './ui.js';

const IC = {
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.6"/></svg>',
  calc: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h0M14 12h2M8 16h2M14 16h2"/></svg>',
};
const weightText = m => `${num(m, 1)} кг`;

// ---------- Басты бет ----------
export function renderSimpleHome(view) {
  view.innerHTML = `
    <section class="s-hero">
      <h1><img class="s-logo" src="icons/logo.png" alt="MalMetr — мал салмағының математикалық моделі" width="387" height="106"></h1>
      <div class="s-scale" aria-hidden="true"></div>
    </section>
    <a class="big-btn" href="#/photo">${IC.camera}<span>Фото арқылы есептеу<small>тәжірибелік режим</small></span></a>
    <a class="big-btn alt" href="#/calc">${IC.calc}<span>L және D арқылы есептеу</span></a>
    ${isStandalone() ? '' : '<a class="s-link" href="#/install">Телефонға орнату</a>'}`;
}
function isStandalone() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } }

// ---------- Калькулятор ----------
export async function renderCalc(view) {
  const saved = (await db.getSetting('simpleCalc')) || { L: '', D: '' };
  view.innerHTML = `
    <div class="s-card">
      <div class="field big">
        <label for="inL">Дене ұзындығы L (см)</label>
        <input class="input big" id="inL" inputmode="decimal" autocomplete="off" placeholder="мысалы, 67" value="${esc(saved.L)}">
      </div>
      <div class="field big">
        <label for="inD">Дене тереңдігі D (см)</label>
        <input class="input big" id="inD" inputmode="decimal" autocomplete="off" placeholder="мысалы, 27" value="${esc(saved.D)}">
      </div>
      <div class="s-result" id="calcOut" aria-live="polite"></div>
      <p class="s-caption">${MODEL_CAPTION}</p>
    </div>`;
  const inL = view.querySelector('#inL'), inD = view.querySelector('#inD'), out = view.querySelector('#calcOut');
  function update() {
    const L = parseNum(inL.value), D = parseNum(inD.value);
    db.setSetting('simpleCalc', { L: inL.value, D: inD.value });
    if (L == null || D == null) { out.className = 's-result empty'; out.innerHTML = 'Болжамды салмақ: — кг'; return; }
    if (implausible(L, D)) { out.className = 's-result warn'; out.innerHTML = 'Мәндерді тексеріңіз'; return; }
    const m = predictMass(L, D);
    out.className = 's-result';
    out.innerHTML = `Болжамды салмақ: <b>${weightText(m)}</b>${outsideStudy(L, D) ? '<small>Өлшемдер зерттелген қойлардан едәуір өзгеше — болжам дәлдігі төмен болуы мүмкін</small>' : ''}`;
  }
  inL.addEventListener('input', update);
  inD.addEventListener('input', update);
  update();
}

// ---------- Фото бойынша автоматты нәтиже ----------
export async function renderAuto(view, go) {
  if (!session.blob) {
    view.innerHTML = `<div class="s-card"><p>Алдымен қойды суретке түсіріңіз.</p><a class="big-btn" href="#/photo">${IC.camera}<span>Фото арқылы есептеу</span></a></div>`;
    return;
  }
  let rodLength = Number(await db.getSetting('simpleRod', 100)) || 100;
  let res = null, headSide = 'auto', viewer = null, alive = true;
  const img = await loadImage(session.url);

  view.innerHTML = `
    <div class="viewer-wrap s-photo" style="aspect-ratio:${session.width} / ${session.height}"><canvas id="aCanvas" aria-label="Түсірілген сурет"></canvas><div class="viewer-hint" id="aHint" hidden></div></div>
    <div id="aBody"></div>`;
  const body = view.querySelector('#aBody');

  viewer = new Viewer(view.querySelector('#aCanvas'), {
    image: img, width: session.width, height: session.height, points: {}, keys: [],
    getOverlay: () => {
      if (!res) return {};
      return {
        cal: res.cal, showRod: !!res.points.rodTop,
        dims: res.ok ? ['L', 'D'] : [], values: res.dims || {},
        mask: res.overlay, bbox: res.ok ? null : res.animal && res.animal.bbox,
        bboxLabel: res.animal ? `${res.animal.name} · ${Math.round(res.animal.score * 100)}%` : '',
      };
    },
  });

  const status = html => { body.innerHTML = `<div class="s-card center">${html}</div>`; };

  // 1) AI модель
  if (!detector.available()) {
    status(`<div class="spinner"></div><p>AI модель жүктелуде… <b id="aProg">0%</b></p><p class="s-caption">Бір рет қана (≈11 МБ). Кейін интернетсіз жұмыс істейді.</p>`);
    const ok = await detector.enable(f => { const e = view.querySelector('#aProg'); if (e) e.textContent = Math.round(f * 100) + '%'; });
    if (!alive) return;
    if (!ok) { showFail([{ ok: false, text: 'AI модель жүктелмеді: ' + (detector.error || 'интернетті тексеріңіз') }]); return () => { alive = false; viewer.destroy(); }; }
  }

  // 2) Өлшеу
  status('<div class="spinner"></div><p>Қой мен рейка ізделуде…</p>');
  try {
    res = await autoMeasure(detector, img, session.width, session.height, { rodLength, headSide });
  } catch (e) {
    console.error(e);
    res = { ok: false, checks: [{ ok: false, text: 'Есептеу қатесі: ' + e.message }], points: {} };
  }
  if (!alive) return;
  draw();

  // Табылған нүктелерді суретке беру (L, D сызықтары мен рейка сызылады)
  function syncPoints() {
    viewer.setKeys([]);
    for (const k of Object.keys(viewer.points)) delete viewer.points[k];
    Object.assign(viewer.points, (res && res.points) || {});
    const h = view.querySelector('#aHint'); if (h) h.hidden = true;
  }

  // Рейканың екі ұшын қолмен белгілеу (тек рейка табылмағанда)
  function markRod() {
    for (const k of ['rodTop', 'rodBottom']) delete viewer.points[k];
    viewer.setKeys(['rodTop', 'rodBottom']);
    viewer.setActive('rodTop');
    const hint = view.querySelector('#aHint');
    const say = () => {
      const k = !viewer.points.rodTop ? 'rodTop' : !viewer.points.rodBottom ? 'rodBottom' : null;
      hint.hidden = false;
      hint.innerHTML = k ? `Түртіңіз: <b>${esc(POINT[k].short)}</b>` : 'Нүктелерді сүйреп дәлдеуге болады';
    };
    viewer.onPlaced = (key, placed) => {
      if (placed && key === 'rodTop' && !viewer.points.rodBottom) viewer.setActive('rodBottom');
      say(); done.disabled = !(viewer.points.rodTop && viewer.points.rodBottom);
    };
    body.innerHTML = `
      <div class="s-card center">
        <p style="font-size:18px;font-weight:700;margin:0 0 6px">Рейканың екі ұшын түртіңіз</p>
        <p class="s-caption" style="margin:0">Алдымен жоғарғы ұшын, содан кейін жерге тиген төменгі ұшын. Суретті екі саусақпен үлкейтуге болады.</p>
      </div>
      <div class="s-actions">
        <button class="big-btn" id="aRodDone" disabled><span>Есептеу</span></button>
        <button class="big-btn alt" id="aRodCancel"><span>Бас тарту</span></button>
      </div>`;
    const done = view.querySelector('#aRodDone');
    done.onclick = () => {
      res = withManualRod(res, viewer.points.rodTop, viewer.points.rodBottom, rodLength);
      viewer.onPlaced = () => {}; draw();
    };
    view.querySelector('#aRodCancel').onclick = () => { viewer.onPlaced = () => {}; draw(); };
    say(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function draw() {
    syncPoints(); viewer.request();
    if (!res.ok) return showFail(res.checks);
    const m = predictMass(res.dims.L, res.dims.D);
    body.innerHTML = `
      <div class="s-card">
        <div class="s-result big">Болжамды салмақ <b>${weightText(m)}</b></div>
        <div class="s-dims">
          <div><b>L = ${num(res.dims.L, 1)} см</b><small>дене ұзындығы</small></div>
          <div><b>D = ${num(res.dims.D, 1)} см</b><small>дене тереңдігі</small></div>
        </div>
        <p class="s-note exp">Тәжірибелік режим: L мен D суреттегі сұлба бойынша автоматты анықталды. Нақты қойларда әлі толық тексерілмеген — мүмкіндігінше таспамен салыстырыңыз.</p>
        ${res.manualRod ? '<p class="s-note">Рейка қолмен белгіленді, қалғаны автоматты есептелді.</p>' : ''}
        ${res.animal && res.animal.cls !== 'sheep' ? `<p class="s-note">Модель жануарды «${esc(res.animal.name)}» деп таныды. Суреттегі сызықтарды тексеріңіз.</p>` : ''}
        ${outsideStudy(res.dims.L, res.dims.D) ? '<p class="s-note">Өлшемдер зерттелген қойлардан едәуір өзгеше — болжам дәлдігі төмен болуы мүмкін.</p>' : ''}
        <p class="s-note">Жүн, камера бұрышы, қойдың қозғалысы және рейканың орны қателікті арттырады. Суреттегі L және D сызықтарын тексеріңіз.</p>
        <p class="s-caption">${MODEL_CAPTION}</p>
      </div>
      <div class="s-actions">
        <a class="big-btn" href="#/photo">${IC.camera}<span>Қайта түсіру</span></a>
        <button class="big-btn alt" id="aGoManual"><span>Рейка, H, L, D нүктелерін қолмен белгілеу</span></button>
      </div>
      ${extrasHTML()}`;
    bindExtras();
  }

  function showFail(checks) {
    syncPoints(); viewer.request();
    body.innerHTML = `
      <div class="s-card">
        <p class="s-fail">${FAIL_MSG}</p>
        <ul class="s-checks">${(checks || []).map(c => `<li class="${c.ok ? 'ok' : 'bad'}">${esc(c.text)}</li>`).join('')}</ul>
      </div>
      <div class="s-actions">
        ${res && res._k ? '<button class="big-btn" id="aMarkRod"><span>Рейканың екі ұшын қолмен белгілеу</span></button>' : ''}
        ${session.url ? '<button class="big-btn alt" id="aGoManual"><span>Рейка, H, L, D нүктелерін қолмен белгілеу</span></button>' : ''}
        <a class="big-btn alt" href="#/photo">${IC.camera}<span>Қайта түсіру</span></a>
        <a class="big-btn alt" href="#/calc">${IC.calc}<span>Калькуляторды пайдалану</span></a>
      </div>
      ${res && res.animal ? extrasHTML() : ''}`;
    bindExtras();
  }

  function extrasHTML() {
    return `
      <details class="s-more">
        <summary>Қосымша баптау</summary>
        <div class="field"><label for="aRod">Рейка ұзындығы, см</label><input class="input" id="aRod" inputmode="decimal" value="${num(rodLength, 0)}"></div>
        ${res && res._seg ? '<button class="btn block" id="aFlip">Қойдың басы басқа жақта</button>' : ''}
        <button class="btn block" id="aManual" style="margin-top:10px">Нүктелерді қолмен тексеру</button>
      </details>`;
  }

  function bindExtras() {
    const mr = view.querySelector('#aMarkRod');
    if (mr) mr.onclick = markRod;
    const gm = view.querySelector('#aGoManual');
    if (gm) gm.onclick = () => {
      // Фотосуретті толық қолмен өлшеу бетіне беру: рейка → H → L → D, нүктелерді өзіңіз қоясыз
      for (const k of Object.keys(session.points)) delete session.points[k];
      session.ai = null;
      session.modelId = 'model-E';
      session.rodLength = rodLength;
      session.stage = 'calibrate';
      go('#/measure');
    };
    const rodIn = view.querySelector('#aRod');
    if (rodIn) rodIn.onchange = () => {
      const v = parseNum(rodIn.value);
      if (!(v > 10 && v < 400)) { rodIn.value = num(rodLength, 0); return; }
      rodLength = v; db.setSetting('simpleRod', v);
      res = reevaluateHead(res, headSide, rodLength); draw();
    };
    const flip = view.querySelector('#aFlip');
    if (flip) flip.onclick = () => {
      headSide = (res.headLeft === false) ? 'left' : 'right';
      res = reevaluateHead(res, headSide, rodLength); draw();
    };
    const man = view.querySelector('#aManual');
    if (man) man.onclick = () => {
      // Табылған нүктелерді қолмен тексеру режиміне беру (бұрынғы өлшеу беті)
      for (const k of Object.keys(session.points)) delete session.points[k];
      Object.assign(session.points, JSON.parse(JSON.stringify(res.points || {})));
      session.rodLength = rodLength;
      session.ai = res.animal ? {
        model: 'COCO-SSD', animal: res.animal, rodAuto: !!res.points.rodTop, segOk: !!(res._seg && res._seg.ok),
        warnings: [], headLeft: res.headLeft, headSide, overlay: res.overlay, _seg: res._seg, _k: res._k,
        suggested: JSON.parse(JSON.stringify(res.points || {})), at: new Date().toISOString(),
      } : null;
      session.modelId = 'model-E';
      session.stage = res.points.rodTop ? 'body' : 'calibrate';
      go('#/measure');
    };
  }

  return () => { alive = false; viewer.destroy(); };
}

export { K };
