// Өлшеу ағыны: кадр → масштаб (рейка) → дене өлшемдері → болжамды салмақ
import { session, rotate90, loadImage, makeThumb } from './session.js';
import { Viewer } from './viewer.js';
import { POINTS, POINT, CAL_KEYS, BODY_KEYS, DIMS, computeDims, PLACEMENT_ERR_PX } from './geometry.js';
import { listModels, getActiveModel, explain, fmt } from './models.js';
import { db, uid, nextAnimalId } from './db.js';
import { ICONS, esc, num, parseNum, toast, openSheet, confirmSheet } from './ui.js';
import { schemeSVG } from './scheme.js';
import { detector, MODEL_NAME } from './ai/detector.js';
import { ROD_COLORS } from './ai/segment.js';
import { dist } from './geometry.js';
import { pickPhoto } from './scanner.js';

const STAGES = [['preview', 'Кадр'], ['calibrate', 'Масштаб'], ['body', 'Өлшемдер'], ['result', 'Нәтиже']];

export async function renderMeasure(view, go) {
  if (!session.blob) {
    view.innerHTML = `
      <div class="card empty-state">
        <h2>Өлшейтін сурет жоқ</h2>
        <p>Алдымен қойды сканерлеңіз немесе суретті галереядан таңдаңыз.</p>
        <div class="btn-row" style="margin-top:12px">
          <a class="btn primary" href="#/scan">${ICONS.scan} Қойды сканерлеу</a>
          <button class="btn" id="mPick">${ICONS.photo} Фото таңдау</button>
        </div>
      </div>`;
    view.querySelector('#mPick').onclick = () => pickPhoto(go);
    return;
  }
  if (!session.rodLength) session.rodLength = await db.getSetting('rodLength', 100);
  let viewer = null;
  let img = await loadImage(session.url);

  view.innerHTML = `
    <div class="stepper" id="stepper"></div>
    <div class="viewer-wrap" id="vwrap">
      <canvas id="vcanvas" aria-label="Өлшеуге арналған сурет"></canvas>
      <div class="viewer-hint" id="vhint"></div>
      <div class="viewer-tools">
        <button id="tZoomIn" aria-label="Үлкейту">${ICONS.zoomIn}</button>
        <button id="tZoomOut" aria-label="Кішірейту">${ICONS.zoomOut}</button>
        <button id="tFit" aria-label="Толық көрсету">${ICONS.fit}</button>
        <button id="tUndo" aria-label="Соңғы әрекетті болдырмау">${ICONS.undo}</button>
        <button id="tRotate" aria-label="90° бұру">${ICONS.rotate}</button>
      </div>
    </div>
    <div class="point-chips" id="chips"></div>
    <div id="panel"></div>`;

  const $ = s => view.querySelector(s);
  const canvas = $('#vcanvas');

  function keysForStage() {
    if (session.stage === 'calibrate') return CAL_KEYS;
    if (session.stage === 'body') return BODY_KEYS;
    return [];
  }
  function firstUnset(keys) { return keys.find(k => !session.points[k]) || null; }
  // AI ұсынған және әлі өзгертілмеген нүктелер
  function aiKeys() {
    const sug = session.ai && session.ai.suggested;
    if (!sug) return [];
    return Object.keys(sug).filter(k => session.points[k] && dist(session.points[k], sug[k]) < 0.5);
  }

  function makeViewer() {
    if (viewer) viewer.destroy();
    const keys = keysForStage();
    viewer = new Viewer(canvas, {
      image: img, width: session.width, height: session.height,
      points: session.points, keys,
      active: firstUnset(keys) || keys[0] || null,
      getOverlay: () => {
        const m = computeDims(session.points, session.rodLength);
        return {
          cal: m.cal,
          showRod: session.stage !== 'preview',
          dims: session.stage === 'body' || session.stage === 'result' ? ['H', 'L', 'D'] : [],
          values: m.dims,
          mask: session.ai && session.ai.overlay && session.showMask !== false && session.stage !== 'result' ? session.ai.overlay : null,
          bbox: session.ai && session.ai.animal && session.stage === 'preview' ? session.ai.animal.bbox : null,
          bboxLabel: session.ai && session.ai.animal ? `${session.ai.animal.name} · ${Math.round(session.ai.animal.score * 100)}%` : '',
          aiKeys: aiKeys(),
        };
      },
      onChange: () => updatePanel(),
      onPlaced: (key, placed) => {
        if (placed) {
          const next = firstUnset(keysForStage());
          if (next) viewer.setActive(next);
        }
        renderChips(); updateHint(); updatePanel();
      },
    });
  }

  function renderStepper() {
    const idx = STAGES.findIndex(s => s[0] === session.stage);
    $('#stepper').innerHTML = STAGES.map((s, i) => `<div class="${i < idx ? 'done' : i === idx ? 'cur' : ''}"><i></i>${s[1]}</div>`).join('');
  }

  function renderChips() {
    const keys = keysForStage();
    $('#chips').innerHTML = keys.map(k => `<button data-k="${k}" class="${viewer && viewer.active === k ? 'active' : ''} ${session.points[k] ? 'set' : ''}"><i style="background:${POINT[k].color}"></i>${POINT[k].short}${aiKeys().includes(k) ? ' <span class="badge info" style="padding:0 6px;font-size:10px">AI</span>' : ''}</button>`).join('');
    $('#chips').querySelectorAll('button').forEach(b => b.onclick = () => { viewer.setActive(b.dataset.k); renderChips(); updateHint(); });
    $('#chips').hidden = !keys.length;
    $('#tUndo').hidden = !keys.length;
    $('#tRotate').hidden = session.stage !== 'preview';
  }

  function updateHint() {
    const h = $('#vhint');
    const k = viewer && viewer.active;
    if (session.stage === 'preview') {
      h.innerHTML = 'Суретті тексеріңіз: <b>екі саусақпен</b> үлкейтіп, жылжытуға болады.';
    } else if (k && keysForStage().includes(k)) {
      const lead = aiKeys().includes(k) ? 'AI ұсынысы — дұрыс па? Қажет болса сүйреңіз' : session.points[k] ? 'Нүктені сүйреп дәлдеңіз' : 'Түртіп белгілеңіз';
      h.innerHTML = `${lead}: <b>${esc(POINT[k].label)}</b>`;
    } else h.innerHTML = '';
    h.hidden = session.stage === 'result';
  }

  function updatePanel() {
    const p = $('#panel');
    const m = computeDims(session.points, session.rodLength);
    if (session.stage === 'preview') {
      p.innerHTML = `
        <div class="card flat" style="margin-top:6px">
          <div class="card-row" style="justify-content:space-between">
            <span class="badge info">${esc(detector.statusLabel())}</span>
            <span class="small muted num">${session.width} × ${session.height} px</span>
          </div>
          <p class="small muted" style="margin:10px 0 0">Сурет өлшемдері өзгертілмей сақталады. Қажет болса, суретті бұрыңыз.</p>
        </div>
        <div class="card" id="aiCard"></div>
        <div class="btn-row">
          <button class="btn" id="bRetake">${ICONS.scan} Қайта сканерлеу</button>
          <button class="btn primary" id="bNext">Өлшеуге өту ${ICONS.arrow}</button>
        </div>`;
      $('#bRetake').onclick = () => go(session.source === 'file' ? '#/home' : '#/scan');
      $('#bNext').onclick = () => setStage('calibrate');
      renderAICard();
    }
    else if (session.stage === 'calibrate') {
      const cal = m.cal;
      const short = cal && cal.P < 150;
      p.innerHTML = `
        <div class="card" style="margin-top:6px">
          <h3>Масштабты анықтау</h3>
          <div class="field">
            <label for="rodLen">Рейканың нақты ұзындығы, R (см)</label>
            <input class="input num" id="rodLen" inputmode="decimal" value="${num(session.rodLength, 1).replace(',0', '')}">
          </div>
          <div class="math">
            <div class="lbl">Формула</div>
            <div class="row">S = R / P</div>
            <div class="lbl">Есептеу</div>
            ${cal ? `
              <div class="row">P = ${fmt(cal.P, 5)} пиксель</div>
              <div class="row">S = ${fmt(cal.R, 5)} / ${fmt(cal.P, 5)} = ${fmt(cal.S, 4)} см/пиксель</div>`
              : `<div class="row" style="color:var(--muted)">Рейканың екі ұшын белгілеңіз</div>`}
          </div>
          ${cal && cal.tiltDeg > 8 ? `<div class="note" style="margin-top:12px">Рейка кадрда ${num(cal.tiltDeg, 0)}°-қа қисайған. Тік өлшемдер рейка бағыты бойынша есептеледі, бірақ рейканы тік ұстаған дұрыс.</div>` : ''}
          ${short ? `<div class="note" style="margin-top:12px">Рейка кадрда қысқа (${num(cal.P, 0)} px). Дәлдікті арттыру үшін жақынырақ түсіріңіз.</div>` : ''}
          <div class="note" style="margin-top:12px">Рейка мен қой камерадан бірдей қашықтықта тұруы керек. Әйтпесе өлшемдер дәл болмауы мүмкін.</div>
          ${aiStageNote(CAL_KEYS)}
        </div>
        <div class="btn-row">
          <button class="btn" id="bBack">Артқа</button>
          <button class="btn primary" id="bNext" ${cal ? '' : 'disabled'}>Дене өлшемдері ${ICONS.arrow}</button>
        </div>`;
      $('#rodLen').addEventListener('change', e => {
        const v = parseNum(e.target.value);
        if (v && v > 0 && v < 1000) { session.rodLength = v; db.setSetting('rodLength', v); }
        else toast('Рейка ұзындығын дұрыс енгізіңіз');
        updatePanel(); viewer.request();
      });
      $('#bBack').onclick = () => setStage('preview');
      $('#bNext').onclick = () => setStage('body');
    }
    else if (session.stage === 'body') {
      const done = BODY_KEYS.every(k => session.points[k]);
      p.innerHTML = `
        <div class="card" style="margin-top:6px">
          <div class="card-row" style="justify-content:space-between;margin-bottom:10px">
            <h3 style="margin:0">ДЕНЕ ӨЛШЕМДЕРІ</h3>
            <button class="btn sm" id="bScheme">Нүктелер сызбасы</button>
          </div>
          <div class="stat-grid">
            ${['H', 'L', 'D'].map(k => `
              <div class="stat">
                <div class="k">${k} · ${DIMS[k].short}</div>
                <div class="v">${m.dims[k] != null ? num(m.dims[k]) : '—'} <small>см</small></div>
                <div class="u">${m.unc[k] != null ? '± ' + num(m.unc[k]) + ' см' : '&nbsp;'}</div>
              </div>`).join('')}
          </div>
          <p class="small muted" style="margin:10px 0 0">± — нүктені ${PLACEMENT_ERR_PX} пиксельге қате қойғандағы болжамды өлшеу қателігі. H мен D рейка бағыты бойынша (тік) өлшенеді.</p>
          ${aiStageNote(BODY_KEYS)}
        </div>
        <div class="btn-row">
          <button class="btn" id="bBack">Масштаб</button>
          <button class="btn primary" id="bNext" ${done ? '' : 'disabled'}>Салмақты есептеу ${ICONS.arrow}</button>
        </div>`;
      $('#bScheme').onclick = showScheme;
      $('#bBack').onclick = () => setStage('calibrate');
      $('#bNext').onclick = () => setStage('result');
    }
    else if (session.stage === 'result') renderResult(p, m);
  }

  function aiStageNote(keys) {
    if (!session.ai || !session.ai.suggested) return '';
    const ai = aiKeys().filter(k => keys.includes(k)).length;
    const sug = keys.filter(k => session.ai.suggested[k]).length;
    if (!sug) return keys === CAL_KEYS ? '<div class="note info" style="margin-top:12px">AI рейканы таппады — екі ұшын қолмен белгілеңіз.</div>' : '';
    return `<div class="note info" style="margin-top:12px">AI ${sug} нүкте ұсынды; оның ${ai}-і әлі өзгертілмеген (үзік шеңбермен белгіленген). Әр нүктені тексеріп, қажет болса сүйреп түзетіңіз.</div>`;
  }

  // ---------- AI көмекші картасы ----------
  async function renderAICard() {
    const card = $('#aiCard');
    if (!card) return;
    const st = detector.state;
    const rodColor = await db.getSetting('rodColor', 'redorange');
    if (st === 'off' || st === 'error') {
      card.innerHTML = `
        <div class="card-row" style="justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">AI көмекші</h3><span class="badge">өшірулі</span></div>
        <p class="small muted">Нейрожелі суреттен жануарды тауып, силуэтін бөледі және өлшеу нүктелерін ұсынады. Модель бір рет жүктеледі (≈11 МБ, интернет керек), кейін интернетсіз жұмыс істейді.</p>
        ${st === 'error' ? `<div class="note">${esc(detector.error)}</div>` : ''}
        <button class="btn primary block" id="aiOn">AI көмекшіні қосу</button>`;
      $('#aiOn').onclick = enableAI;
      return;
    }
    if (st === 'loading') {
      card.innerHTML = `<h3>AI көмекші</h3><p class="small muted">Модель жүктелуде…</p>
        <div style="height:8px;border-radius:6px;background:var(--surface-2);overflow:hidden"><i id="aiBar" style="display:block;height:100%;width:${Math.round((session._aiProg || 0) * 100)}%;background:var(--accent);transition:width .2s"></i></div>`;
      return;
    }
    const ai = session.ai;
    const colorSel = `<div class="field" style="margin:0 0 10px"><label for="rodColor">Рейка түсі</label>
      <select class="input" id="rodColor">${Object.entries(ROD_COLORS).map(([k, v]) => `<option value="${k}" ${k === rodColor ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>`;
    if (!ai) {
      card.innerHTML = `
        <div class="card-row" style="justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">AI көмекші</h3><span class="badge ok">дайын</span></div>
        ${colorSel}
        <button class="btn accent block" id="aiRun">${ICONS.scan} Қойды тауып, нүктелерді ұсыну</button>
        <p class="small muted" style="margin:8px 0 0">Ұсынылған нүктелер тексерілмеген: әрқайсысын өзіңіз тексересіз.</p>`;
    } else {
      const a = ai.animal;
      const ok = (v, yes, no) => `<span class="badge ${v ? 'ok' : 'warn'}">${v ? yes : no}</span>`;
      card.innerHTML = `
        <div class="card-row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">AI нәтижесі</h3><span class="badge info">тексерілмеген</span></div>
        <div class="list small" style="gap:6px">
          <div class="card-row" style="justify-content:space-between"><span>Жануар</span>${a ? `<b>${esc(a.name)} · ${Math.round(a.score * 100)}%</b>` : '<span class="badge warn">табылмады</span>'}</div>
          ${a && a.cls !== 'sheep' ? '<div class="note" style="margin:0">Модель бұл жануарды қой деп танымады. Кадрды тексеріңіз немесе нүктелерді қолмен қойыңыз.</div>' : ''}
          ${a ? `<div class="card-row" style="justify-content:space-between"><span>Силуэт</span>${ok(ai.segOk, 'сенімді', 'сенімсіз')}</div>` : ''}
          <div class="card-row" style="justify-content:space-between"><span>Рейка</span>${ok(ai.rodAuto, 'табылды', 'табылмады')}</div>
          ${a && ai.warnings && ai.warnings.length ? `<div class="note" style="margin:0">Әсіресе мұқият тексеріңіз: ${ai.warnings.map(w => ({ withers: 'шоқтық', chest: 'кеуде асты', ground: 'жер деңгейі', shape: 'силуэт пішіні — нүктелер ұсынылмады' }[w] || w)).join(', ')}.</div>` : ''}
          ${a && ai.headLeft != null ? `<div class="card-row" style="justify-content:space-between"><span>Басы</span>
            <span class="btn-row" style="gap:6px;flex-wrap:nowrap">
              <button class="btn sm ${ai.headLeft ? 'primary' : ''}" data-head="left">сол жақта</button>
              <button class="btn sm ${!ai.headLeft ? 'primary' : ''}" data-head="right">оң жақта</button>
            </span></div>` : ''}
        </div>
        ${colorSel.replace('margin:0 0 10px', 'margin:12px 0 10px')}
        <div class="btn-row">
          <button class="btn sm" id="aiRun">Қайта табу</button>
          ${ai.overlay ? `<button class="btn sm" id="aiMask">${session.showMask === false ? 'Силуэтті көрсету' : 'Силуэтті жасыру'}</button>` : ''}
        </div>`;
      card.querySelectorAll('[data-head]').forEach(b => b.onclick = () => setHead(b.dataset.head));
      const mb = $('#aiMask'); if (mb) mb.onclick = () => { session.showMask = session.showMask === false; viewer.request(); renderAICard(); };
    }
    $('#rodColor').onchange = e => db.setSetting('rodColor', e.target.value);
    $('#aiRun').onclick = runAI;
  }

  async function enableAI() {
    session._aiProg = 0;
    const p = detector.enable(f => { session._aiProg = f; const bar = $('#aiBar'); if (bar) bar.style.width = Math.round(f * 100) + '%'; });
    renderAICard();
    const ok = await p;
    if (ok) toast('AI көмекші дайын'); else toast('AI модельді жүктеу мүмкін болмады', 3500);
    renderAICard(); updateHint();
  }

  async function runAI() {
    const btn = $('#aiRun');
    const hasPoints = Object.keys(session.points).length > 0;
    if (hasPoints && !session.ai && !(await confirmSheet('Нүктелерді ауыстыру', 'Бұрын қойылған нүктелер AI ұсынысымен ауыстырылады.', 'Ауыстыру'))) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Есептелуде…'; }
    try {
      const rodColor = await db.getSetting('rodColor', 'redorange');
      const r = await detector.suggest(img, session.width, session.height, { rodColor });
      // Силуэт анық бөлінбесе, дене нүктелері ұсынылмайды (олар дұрыс емес болар еді);
      // тек табылған рейка ұштары қалады, қалғанын қолмен қою керек
      const pts = r.segOk ? r.points : Object.fromEntries(Object.entries(r.points).filter(([k]) => k.startsWith('rod')));
      for (const k of Object.keys(session.points)) delete session.points[k];
      Object.assign(session.points, JSON.parse(JSON.stringify(pts)));
      session.ai = {
        model: r.model, animal: r.animal, rodAuto: !!r.rod, segOk: r.segOk, warnings: r.warnings,
        headLeft: r.headLeft, autoLeft: r.autoLeft, headSide: 'auto', overlay: r.overlay, _seg: r._seg, _k: r._k,
        suggested: JSON.parse(JSON.stringify(pts)), at: new Date().toISOString(),
      };
      if (!r.segOk) toast('Силуэт анық бөлінбеді — нүктелерді қолмен қойыңыз', 4500);
      viewer.undoStack.length = 0;
      if (!r.animal) toast('Жануар табылмады — нүктелерді қолмен қойыңыз', 3500);
      else toast(`${r.animal.name} табылды · ${Math.round(r.animal.score * 100)}%`);
    } catch (e) { toast('AI қатесі: ' + e.message, 3500); }
    renderAICard(); renderChips(); updateHint(); viewer.request();
  }

  function setHead(side) {
    const ai = session.ai; if (!ai || !ai._seg) return;
    const old = { ...ai.suggested };
    const r = detector.pointsFromSeg(ai._seg, ai._k, side);
    if (!r.bodyPoints) { toast('Силуэт бойынша нүктелер табылмады'); return; }
    for (const [k, p] of Object.entries(r.bodyPoints)) {
      // пайдаланушы түзеткен нүктелерді өзгертпейміз
      if (!session.points[k] || (old[k] && dist(session.points[k], old[k]) < 0.5)) session.points[k] = { ...p };
      ai.suggested[k] = { ...p };
    }
    ai.headLeft = r.headLeft; ai.headSide = side; ai.warnings = r.warnings;
    renderAICard(); viewer.request();
  }

  async function renderResult(p, m) {
    const models = await listModels();
    let model = await getActiveModel();
    if (session.modelId) model = models.find(x => x.id === session.modelId) || model;
    if (!session.animalId) session.animalId = await nextAnimalId();
    let ex = null, err = null;
    try { ex = explain(model, m.dims); } catch (e) { err = e.message; }
    const valid = ex && Number.isFinite(ex.value) && ex.value > 0;
    p.innerHTML = `
      <div class="card" style="margin-top:6px">
        <div class="field">
          <label for="mSel">Математикалық модель</label>
          <select class="input" id="mSel">${models.map(x => `<option value="${x.id}" ${x.id === model.id ? 'selected' : ''}>${esc(x.name)} (v${x.version})</option>`).join('')}</select>
        </div>
        <div class="result-big">
          <div class="k">БОЛЖАМДЫ САЛМАҚ</div>
          <div class="v">${valid ? num(ex.value) + ' кг' : '—'}</div>
          <div class="disclaimer">Модельдік есептеу. Нақты өлшеумен тексерілмеген.</div>
        </div>
        ${err ? `<div class="note">Формулада қате: ${esc(err)}</div>` : ''}
        ${ex && !valid ? `<div class="note">Бұл модель бойынша нәтиже мағынасыз шықты (${esc(fmt(ex.value))}). Коэффициенттерді тексеріңіз.</div>` : ''}
        ${ex ? `
        <div class="math">
          <div class="lbl">1. Бастапқы өлшемдер</div>
          <div class="row">H = ${num(m.dims.H)} см;  L = ${num(m.dims.L)} см;  D = ${num(m.dims.D)} см</div>
          <div class="lbl">2. Формула</div>
          <div class="row">${esc(ex.formula)}</div>
          <div class="lbl">3. Мәндерді қою</div>
          <div class="row">${esc(ex.substitution)}</div>
          <div class="lbl">4. Аралық есептеулер</div>
          ${ex.steps.map(s => `<div class="row">${esc(s)}</div>`).join('')}
          <div class="lbl">5. Нәтиже</div>
          <div class="row"><b>M ≈ ${num(ex.value)} кг</b></div>
        </div>` : ''}
      </div>
      <div class="card">
        <h3>Нәтижені сақтау</h3>
        <div class="grid-2">
          <div class="field"><label for="aId">Жануар ID</label><input class="input" id="aId" value="${esc(session.animalId)}"></div>
          <div class="field"><label for="aAct">Нақты салмақ, кг</label><input class="input num" id="aAct" inputmode="decimal" placeholder="таразымен өлшенсе" value="${session.actual != null ? num(session.actual) : ''}"></div>
        </div>
        <div class="field"><label for="aNote">Ескертпе</label><input class="input" id="aNote" value="${esc(session.note || '')}" placeholder="мысалы: тұқымы, жасы, жүнінің ұзындығы"></div>
        <p class="small muted">Нақты салмақты тек таразымен өлшеген жағдайда енгізіңіз. Бос қалса, қателік есептелмейді.</p>
        <div class="btn-row">
          <button class="btn" id="bBack">Өлшемдерге оралу</button>
          <button class="btn accent" id="bSave" ${valid ? '' : 'disabled'}>${ICONS.save} Сақтау</button>
        </div>
      </div>`;
    $('#mSel').onchange = e => { session.modelId = e.target.value; updatePanel(); };
    const keep = () => {
      session.animalId = $('#aId').value.trim();
      session.actual = parseNum($('#aAct').value);
      session.note = $('#aNote').value.trim();
    };
    ['#aId', '#aAct', '#aNote'].forEach(s => $(s).addEventListener('input', keep));
    $('#bBack').onclick = () => { keep(); setStage('body'); };
    $('#bSave').onclick = async () => {
      keep();
      if (session.actual != null && !(session.actual > 0)) { toast('Нақты салмақ дұрыс емес'); return; }
      $('#bSave').disabled = true;
      try {
        const id = await saveRecord(model, m, ex.value);
        toast('Өлшеу сақталды');
        go('#/record/' + id);
      } catch (e) { toast('Сақтау мүмкін болмады: ' + e.message); $('#bSave').disabled = false; }
    };
  }

  async function saveRecord(model, m, predicted) {
    const existing = session.editingId ? await db.get('records', session.editingId) : null;
    const now = new Date().toISOString();
    const rec = {
      ...(existing || {}),
      id: existing ? existing.id : uid('r-'),
      animalId: session.animalId || await nextAnimalId(),
      date: existing ? existing.date : now,
      updatedAt: now,
      method: 'photo',
      photo: session.blob,
      thumb: await makeThumb(session.blob),
      photoW: session.width, photoH: session.height,
      points: JSON.parse(JSON.stringify(session.points)),
      rodLength: session.rodLength,
      scale: m.cal.S, rodPx: m.cal.P,
      dims: { H: m.dims.H, L: m.dims.L, D: m.dims.D },
      unc: { ...m.unc },
      modelId: model.id, modelName: model.name, modelVersion: model.version,
      formula: model.formula, coeffs: JSON.parse(JSON.stringify(model.coeffs)),
      predicted,
      actual: session.actual ?? null,
      note: session.note || '',
      aiAssist: aiSummary(m),
    };
    await db.put('records', rec);
    session.editingId = rec.id;
    return rec.id;
  }

  // AI ұсынысы мен түпкі (тексерілген) өлшемдерді салыстыру — зерттеу үшін
  function aiSummary(m) {
    const ai = session.ai;
    if (!ai || !ai.suggested || !Object.keys(ai.suggested).length) return ai && ai.animal === null ? { model: ai.model, animal: null, at: ai.at } : null;
    // Масштаб үшін түпкі рейка нүктелері қолданылады: дене нүктелерінің ұсынысы ғана бағаланады
    const pts = { ...ai.suggested, rodTop: session.points.rodTop, rodBottom: session.points.rodBottom };
    const aiDims = computeDims(pts, session.rodLength).dims;
    const moved = {};
    for (const [k, p] of Object.entries(ai.suggested)) if (session.points[k]) moved[k] = dist(p, session.points[k]) * (m.cal ? m.cal.S : 1);
    return {
      model: ai.model, at: ai.at, animal: ai.animal, rodAuto: ai.rodAuto, segOk: ai.segOk,
      headLeft: ai.headLeft, headSideManual: ai.headSide !== 'auto', warnings: ai.warnings,
      suggested: JSON.parse(JSON.stringify(ai.suggested)), aiDims,
      movedCm: moved, corrected: Object.values(moved).filter(v => v > 0.05).length,
    };
  }

  function showScheme() {
    openSheet(`
      <h2>Нүктелер сызбасы</h2>
      <div style="color:var(--text)">${schemeSVG()}</div>
      <div class="list" style="margin-top:10px">
        ${POINTS.filter(p => p.group !== 'rod').map(p => `<div class="card-row small"><i style="width:10px;height:10px;border-radius:50%;background:${p.color};flex:none"></i><span><b>${p.short}</b> — ${p.label}</span></div>`).join('')}
      </div>
      <div class="note info" style="margin-top:12px">
        <b>H</b> — шоқтықтан жерге дейінгі тік қашықтық.<br>
        <b>L</b> — иық буынынан шонданай төмпешігіне дейінгі қиғаш ұзындық.<br>
        <b>D</b> — арқа сызығынан кеуде астына дейінгі тік қашықтық (аяқтар кірмейді).
      </div>
      <button class="btn block" data-close>Жабу</button>`);
  }

  function setStage(st) {
    session.stage = st;
    renderStepper();
    const keys = keysForStage();
    viewer.setKeys(keys);
    viewer.setActive(firstUnset(keys) || keys[0] || null);
    renderChips(); updateHint(); updatePanel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('#tZoomIn').onclick = () => viewer.zoomBy(1.5);
  $('#tZoomOut').onclick = () => viewer.zoomBy(1 / 1.5);
  $('#tFit').onclick = () => viewer.fit();
  $('#tUndo').onclick = () => { if (!viewer.undo()) toast('Болдырмайтын әрекет жоқ'); renderChips(); updateHint(); };
  $('#tRotate').onclick = async () => {
    const r = await rotate90(session.blob);
    URL.revokeObjectURL(session.url);
    session.blob = r.blob; session.url = URL.createObjectURL(r.blob);
    session.width = r.width; session.height = r.height;
    for (const k of Object.keys(session.points)) delete session.points[k];
    session.ai = null;
    img = await loadImage(session.url);
    makeViewer(); renderChips(); updateHint(); updatePanel();
  };

  makeViewer();
  renderStepper(); renderChips(); updateHint(); updatePanel();
  const unsub = detector.onChange(() => { if (session.stage === 'preview') renderAICard(); });
  detector.autoload();

  return () => { unsub(); if (viewer) viewer.destroy(); };
}

export async function loadRecordIntoSession(rec) {
  const { setSessionImage } = await import('./session.js');
  await setSessionImage(rec.photo, rec.photoW, rec.photoH, 'record');
  Object.assign(session.points, JSON.parse(JSON.stringify(rec.points || {})));
  session.rodLength = rec.rodLength || 100;
  session.editingId = rec.id;
  session.animalId = rec.animalId;
  session.actual = rec.actual;
  session.note = rec.note || '';
  session.modelId = rec.modelId;
  session.ai = rec.aiAssist && rec.aiAssist.suggested ? { ...rec.aiAssist, overlay: null, _seg: null, headSide: rec.aiAssist.headSideManual ? (rec.aiAssist.headLeft ? 'left' : 'right') : 'auto' } : null;
  session.stage = 'body';
}
