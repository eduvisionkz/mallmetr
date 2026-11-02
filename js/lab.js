// «ЗЕРТТЕУ ЗЕРТХАНАСЫ», «НӘТИЖЕЛЕР» және жеке өлшеу беті; экспорт пен сақтық көшірме
import { db, uid, nextAnimalId, blobToDataURL, dataURLToBlob } from './db.js';
import { getActiveModel, explain, listModels, fmt } from './models.js';
import { DIMS } from './geometry.js';
import { ICONS, esc, num, parseNum, toast, openSheet, confirmSheet, dateStr, download } from './ui.js';
import { scatterChart, barChart, SERIES_COLORS } from './charts.js';
import { Viewer } from './viewer.js';
import { loadImage } from './session.js';
import { loadRecordIntoSession } from './measure.js';

export function recordError(r) {
  if (r.actual == null || r.predicted == null) return null;
  const e = Math.abs(r.predicted - r.actual);
  return { e, ep: r.actual > 0 ? e / r.actual * 100 : null };
}

async function allRecords() {
  const list = await db.getAll('records');
  return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ---------- ЗЕРТХАНА ----------
export async function renderLab(view, go) {
  const recs = await allRecords();
  const withAct = recs.filter(r => recordError(r));
  const errs = withAct.map(recordError);
  const mae = errs.length ? errs.reduce((s, x) => s + x.e, 0) / errs.length : null;
  const mape = errs.length ? errs.reduce((s, x) => s + x.ep, 0) / errs.length : null;

  view.innerHTML = `
    <div class="eyebrow">Зерттеу зертханасы</div>
    <h2 style="margin-bottom:12px">Деректер мен қателік талдауы</h2>
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat"><div class="k">Жазбалар</div><div class="v">${recs.length}</div><div class="u">нақты салмақпен: ${withAct.length}</div></div>
      <div class="stat"><div class="k">Орташа E</div><div class="v">${mae != null ? num(mae) : '—'} <small>кг</small></div><div class="u">абсолют қателік</div></div>
      <div class="stat"><div class="k">Орташа E%</div><div class="v">${mape != null ? num(mape) : '—'} <small>%</small></div><div class="u">пайыздық қателік</div></div>
    </div>
    <div class="btn-row" style="margin-bottom:14px">
      <button class="btn primary" id="lNew">${ICONS.plus} Жаңа жазба</button>
      <button class="btn" id="lCsv">${ICONS.download} CSV</button>
      <button class="btn" id="lPdf">${ICONS.download} PDF</button>
    </div>

    <div class="card">
      <h3>Өлшеу кестесі</h3>
      ${recs.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Күні</th><th>Биіктігі, см</th><th>Ұзындығы, см</th><th>Дене тереңдігі, см</th><th>Болжамды салмақ, кг</th><th>Нақты салмақ, кг</th><th>Қателік</th></tr></thead>
          <tbody>${recs.map(r => {
            const e = recordError(r);
            return `<tr data-id="${r.id}" style="cursor:pointer">
              <td><b>${esc(r.animalId)}</b>${r.method === 'manual' ? ' <span class="badge" style="padding:1px 6px">таспа</span>' : ''}</td>
              <td>${esc(dateStr(r.date).split(' ')[0])}</td>
              <td>${num(r.dims?.H)}</td><td>${num(r.dims?.L)}</td><td>${num(r.dims?.D)}</td>
              <td>${num(r.predicted)}</td>
              <td class="${r.actual == null ? 'empty' : ''}">${r.actual != null ? num(r.actual) : ''}</td>
              <td class="${e ? '' : 'empty'}">${e ? `${num(e.e)} кг · ${num(e.ep)}%` : ''}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      <p class="small muted" style="margin-top:8px">Нақты салмақ енгізілмесе, қателік есептелмейді. Жолды басып, нақты салмақты енгізуге болады.</p>`
      : `<div class="empty-state"><p>Әзірге жазба жоқ. Қойды сканерлеп өлшеңіз немесе таспамен өлшенген деректерді қолмен енгізіңіз.</p></div>`}
    </div>

    ${withAct.length ? `
    <div class="card">
      <h3>Болжам мен нақты салмақ</h3>
      <canvas class="chart" id="scChart"></canvas>
      <p class="small muted">Әр нүкте — бір жануар. Пунктир — мінсіз болжам (болжам = нақты). Нүкте пунктирге неғұрлым жақын болса, қателік соғұрлым аз.</p>
    </div>
    <div class="card">
      <h3>Пайыздық қателік, E%</h3>
      <canvas class="chart" id="erChart"></canvas>
    </div>` : recs.length ? `
    <div class="card">
      <h3>Болжамды салмақтар</h3>
      <canvas class="chart" id="prChart"></canvas>
      <p class="small muted">Нақты салмақтар әлі енгізілмегендіктен, тек модельдік болжамдар көрсетілген.</p>
    </div>` : ''}

    ${aiLabCard(recs)}
    <div class="card">
      <h3>Қателік формулалары</h3>
      <div class="math">
        <div class="row">E = |Mболжам − Mнақты|</div>
        <div class="row">E% = E / Mнақты · 100%</div>
      </div>
      <a class="btn block" href="#/builder" style="margin-top:12px">${ICONS.builder} Модельдерді салыстыру</a>
    </div>`;

  view.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => go('#/record/' + tr.dataset.id));
  view.querySelector('#lNew').onclick = () => manualRecordSheet(go);
  view.querySelector('#lCsv').onclick = () => exportCSV(recs);
  view.querySelector('#lPdf').onclick = () => exportPDF(recs);

  const drawCharts = () => {
    const sc = view.querySelector('#scChart');
    if (sc) {
      scatterChart(sc, [{ name: 'Жазбалар', color: SERIES_COLORS[0], points: withAct.map(r => [r.actual, r.predicted]) }], { xLabel: 'Нақты, кг', yLabel: 'Болжам, кг' });
      barChart(view.querySelector('#erChart'), withAct.slice().reverse().map(r => ({ label: r.animalId, value: recordError(r).ep, color: SERIES_COLORS[1] })), { yLabel: 'E, %' });
    }
    const pr = view.querySelector('#prChart');
    if (pr) barChart(pr, recs.slice().reverse().slice(-20).map(r => ({ label: r.animalId, value: r.predicted || 0, color: SERIES_COLORS[0] })), { yLabel: 'кг' });
  };
  drawCharts();
  window.addEventListener('resize', drawCharts);
  return () => window.removeEventListener('resize', drawCharts);
}

function aiLabCard(recs) {
  const rs = recs.filter(r => r.aiAssist && r.aiAssist.aiDims && r.dims);
  if (!rs.length) return '';
  const mean = k => { const v = rs.map(r => Math.abs(r.aiAssist.aiDims[k] - r.dims[k])).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b) / v.length : null; };
  const corr = rs.reduce((s, r) => s + (r.aiAssist.corrected || 0), 0) / rs.length;
  return `<div class="card">
    <h3>AI көмекшінің дәлдігі</h3>
    <p class="small muted">AI ұсынған нүктелер бойынша өлшемдерді оқушы тексерген өлшемдермен салыстыру (n = ${rs.length}).</p>
    <div class="stat-grid">
      ${['H', 'L', 'D'].map(k => `<div class="stat"><div class="k">орташа |Δ${k}|</div><div class="v">${num(mean(k))} <small>см</small></div></div>`).join('')}
    </div>
    <p class="small muted" style="margin-top:8px">Бір суретте орта есеппен ${num(corr)} нүкте түзетілді (6 нүктенің ішінен).</p>
  </div>`;
}

// Таспамен (сантиметрлік лентамен) өлшенген деректерді қолмен енгізу
async function manualRecordSheet(go) {
  const model = await getActiveModel();
  const aid = await nextAnimalId();
  openSheet(`
    <h2>Жаңа жазба</h2>
    <p class="small muted">Өлшеуіш таспамен немесе рейкамен тікелей өлшенген деректер. Фото арқылы өлшеу үшін «Қойды сканерлеу» бөлімін қолданыңыз.</p>
    <div class="field"><label for="nId">Жануар ID</label><input class="input" id="nId" value="${esc(aid)}"></div>
    <div class="grid-3">
      <div class="field"><label for="nH">H, см</label><input class="input num" id="nH" inputmode="decimal"></div>
      <div class="field"><label for="nL">L, см</label><input class="input num" id="nL" inputmode="decimal"></div>
      <div class="field"><label for="nD">D, см</label><input class="input num" id="nD" inputmode="decimal"></div>
    </div>
    <div class="field"><label for="nA">Нақты салмақ, кг (міндетті емес)</label><input class="input num" id="nA" inputmode="decimal"></div>
    <div class="field"><label for="nN">Ескертпе</label><input class="input" id="nN"></div>
    <div class="note info small" id="nPred">Модель: ${esc(model.name)}</div>
    <div class="btn-row"><button class="btn" data-close>Бас тарту</button><button class="btn accent" id="nSave">${ICONS.save} Сақтау</button></div>`,
  (body, close) => {
    const g = s => body.querySelector(s);
    const dims = () => ({ H: parseNum(g('#nH').value), L: parseNum(g('#nL').value), D: parseNum(g('#nD').value) });
    const upd = () => {
      const d = dims();
      if ([d.H, d.L, d.D].every(v => v > 0)) {
        try { const ex = explain(model, d); g('#nPred').innerHTML = `Модель: ${esc(model.name)} → болжамды салмақ <b>${num(ex.value)} кг</b>. Модельдік есептеу. Нақты өлшеумен тексерілмеген.`; } catch (e) { g('#nPred').textContent = e.message; }
      }
    };
    ['#nH', '#nL', '#nD'].forEach(s => g(s).addEventListener('input', upd));
    g('#nSave').onclick = async () => {
      const d = dims();
      if (![d.H, d.L, d.D].every(v => v > 0)) { toast('H, L, D мәндерін енгізіңіз'); return; }
      const actual = parseNum(g('#nA').value);
      if (actual != null && !(actual > 0)) { toast('Нақты салмақ дұрыс емес'); return; }
      let pred;
      try { pred = explain(model, d).value; } catch (e) { toast(e.message); return; }
      const now = new Date().toISOString();
      const rec = {
        id: uid('r-'), animalId: g('#nId').value.trim() || aid, date: now, updatedAt: now, method: 'manual',
        photo: null, thumb: null, points: null, rodLength: null, scale: null,
        dims: d, unc: null, modelId: model.id, modelName: model.name, modelVersion: model.version,
        formula: model.formula, coeffs: structuredClone(model.coeffs), predicted: pred, actual, note: g('#nN').value.trim(),
      };
      await db.put('records', rec);
      close(); toast('Жазба сақталды'); go('#/record/' + rec.id);
    };
  });
}

// ---------- НӘТИЖЕЛЕР ----------
export async function renderResults(view, go) {
  const recs = await allRecords();
  const urls = [];
  view.innerHTML = `
    <div class="eyebrow">Нәтижелер</div>
    <h2 style="margin-bottom:12px">Өлшеулер тарихы</h2>
    <input class="input" id="rSearch" type="search" placeholder="ID немесе ескертпе бойынша іздеу" style="margin-bottom:12px">
    <div class="list" id="rList"></div>
    <div class="section-title"><h3>Деректерді сақтау</h3></div>
    <div class="card">
      <p class="small muted">Барлық деректер тек осы құрылғыда (браузер жадында) сақталады. Телефонды ауыстырғанда немесе браузер деректерін тазаламас бұрын сақтық көшірме жасаңыз.</p>
      <div class="btn-row">
        <button class="btn" id="rBackup">${ICONS.download} JSON көшірме</button>
        <label class="btn">${ICONS.upload} JSON жүктеу<input type="file" accept="application/json,.json" id="rImport" hidden></label>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn" id="rCsv">${ICONS.download} CSV</button>
        <button class="btn" id="rPdf">${ICONS.download} PDF</button>
      </div>
    </div>`;

  const list = view.querySelector('#rList');
  function draw(q = '') {
    const t = q.trim().toLowerCase();
    const items = recs.filter(r => !t || (r.animalId || '').toLowerCase().includes(t) || (r.note || '').toLowerCase().includes(t));
    urls.forEach(u => URL.revokeObjectURL(u)); urls.length = 0;
    list.innerHTML = items.length ? items.map(r => {
      let thumb = `<div class="thumb">${r.method === 'manual' ? ICONS.ruler : ICONS.photo}</div>`;
      const b = r.thumb || r.photo;
      if (b instanceof Blob) { const u = URL.createObjectURL(b); urls.push(u); thumb = `<img class="thumb" src="${u}" alt="">`; }
      return `<a class="list-item" href="#/record/${r.id}">
        ${thumb}
        <div class="meta"><b>${esc(r.animalId)}</b><span>${esc(dateStr(r.date))}</span><br>
          <span class="num">H ${num(r.dims?.H)} · L ${num(r.dims?.L)} · D ${num(r.dims?.D)} см</span></div>
        <div class="w">${num(r.predicted)} кг<br><span class="small muted" style="font-weight:600">${r.actual != null ? 'нақты ' + num(r.actual) : 'болжам'}</span></div>
      </a>`;
    }).join('') : `<div class="card empty-state">${recs.length ? 'Ештеңе табылмады' : 'Әзірге сақталған өлшеу жоқ.'}<div class="btn-row" style="margin-top:12px;justify-content:center"><a class="btn primary" href="#/scan">${ICONS.scan} Қойды сканерлеу</a></div></div>`;
  }
  draw();
  view.querySelector('#rSearch').oninput = e => draw(e.target.value);
  view.querySelector('#rBackup').onclick = () => backupJSON();
  view.querySelector('#rImport').onchange = e => importJSON(e.target.files[0], () => renderResults(view, go));
  view.querySelector('#rCsv').onclick = () => exportCSV(recs);
  view.querySelector('#rPdf').onclick = () => exportPDF(recs);
  return () => urls.forEach(u => URL.revokeObjectURL(u));
}

// ---------- ЖЕКЕ ЖАЗБА ----------
export async function renderRecord(view, go, id) {
  const r = await db.get('records', id);
  if (!r) { view.innerHTML = `<div class="card empty-state">Жазба табылмады. <a href="#/results">Нәтижелерге оралу</a></div>`; return; }
  let viewer = null, url = null;
  const e = recordError(r);
  let ex = null;
  try { ex = explain({ formula: r.formula, coeffs: r.coeffs || [] }, r.dims); } catch {}

  view.innerHTML = `
    <div class="card-row" style="justify-content:space-between;margin-bottom:10px">
      <div><div class="eyebrow">${r.method === 'manual' ? 'Таспамен өлшеу' : 'Фото арқылы өлшеу'}</div><h2 style="margin:2px 0 0">${esc(r.animalId)}</h2></div>
      <span class="small muted">${esc(dateStr(r.date))}</span>
    </div>
    ${r.photo ? `<div class="viewer-wrap" style="height:46vh;min-height:280px;margin-bottom:12px"><canvas id="recCanvas"></canvas>
      <div class="viewer-tools"><button id="rFit" aria-label="Толық көрсету">${ICONS.fit}</button></div></div>` : ''}
    <div class="result-big">
      <div class="k">БОЛЖАМДЫ САЛМАҚ</div>
      <div class="v">${num(r.predicted)} кг</div>
      <div class="disclaimer">Модельдік есептеу. Нақты өлшеумен тексерілмеген.</div>
    </div>
    <div class="stat-grid" style="margin-bottom:12px">
      ${['H', 'L', 'D'].map(k => `<div class="stat"><div class="k">${k} · ${DIMS[k].short}</div><div class="v">${num(r.dims?.[k])} <small>см</small></div><div class="u">${r.unc?.[k] != null ? '± ' + num(r.unc[k]) + ' см' : '&nbsp;'}</div></div>`).join('')}
    </div>
    <div class="card">
      <h3>Нақты салмақ және қателік</h3>
      <div class="grid-2">
        <div class="field"><label for="eAct">Нақты салмақ, кг</label><input class="input num" id="eAct" inputmode="decimal" value="${r.actual != null ? num(r.actual) : ''}" placeholder="таразымен өлшенсе"></div>
        <div class="field"><label for="eId">Жануар ID</label><input class="input" id="eId" value="${esc(r.animalId)}"></div>
      </div>
      <div class="field"><label for="eNote">Ескертпе</label><input class="input" id="eNote" value="${esc(r.note || '')}"></div>
      <div class="math" id="errBox">${e ? `
        <div class="row">E = |${fmt(r.predicted, 5)} − ${fmt(r.actual, 5)}| = ${fmt(e.e, 4)} кг</div>
        <div class="row">E% = ${fmt(e.e, 4)} / ${fmt(r.actual, 5)} · 100% = ${fmt(e.ep, 3)}%</div>` : '<div class="row" style="color:var(--muted)">Нақты салмақ енгізілмеген — қателік есептелмейді</div>'}
      </div>
      <button class="btn primary block" id="eSave" style="margin-top:12px">${ICONS.save} Өзгерістерді сақтау</button>
    </div>
    <div class="card">
      <h3>Есептеу</h3>
      <p class="small muted">Модель: ${esc(r.modelName || '—')}${r.modelVersion ? ' (v' + r.modelVersion + ')' : ''}</p>
      ${ex ? `<div class="math">
        <div class="lbl">Формула</div><div class="row">${esc(ex.formula)}</div>
        <div class="lbl">Мәндерді қою</div><div class="row">${esc(ex.substitution)}</div>
        <div class="lbl">Аралық есептеулер</div>${ex.steps.map(s => `<div class="row">${esc(s)}</div>`).join('')}
      </div>` : ''}
      ${r.scale ? `<div class="math" style="margin-top:10px">
        <div class="lbl">Масштаб</div>
        <div class="row">S = R / P = ${fmt(r.rodLength, 5)} / ${fmt(r.rodPx, 5)} = ${fmt(r.scale, 4)} см/пиксель</div>
      </div>` : ''}
      <button class="btn block" id="eRecalc" style="margin-top:12px">Белсенді модельмен қайта есептеу</button>
    </div>
    ${aiRecordCard(r)}
    <div class="btn-row">
      ${r.photo ? `<button class="btn" id="eRemeasure">${ICONS.edit} Нүктелерді түзету</button>` : ''}
      <button class="btn danger" id="eDel">${ICONS.trash} Жою</button>
    </div>`;

  if (r.photo) {
    url = URL.createObjectURL(r.photo);
    const img = await loadImage(url);
    const { computeDims } = await import('./geometry.js');
    const pts = r.points || {};
    viewer = new Viewer(view.querySelector('#recCanvas'), {
      image: img, width: r.photoW, height: r.photoH, points: pts, keys: [],
      getOverlay: () => { const m = computeDims(pts, r.rodLength); return { cal: m.cal, showRod: true, dims: ['H', 'L', 'D'], values: m.dims }; },
    });
    view.querySelector('#rFit').onclick = () => viewer.fit();
  }

  view.querySelector('#eSave').onclick = async () => {
    const a = parseNum(view.querySelector('#eAct').value);
    if (view.querySelector('#eAct').value.trim() && !(a > 0)) { toast('Нақты салмақ дұрыс емес'); return; }
    r.actual = a; r.animalId = view.querySelector('#eId').value.trim() || r.animalId; r.note = view.querySelector('#eNote').value.trim();
    r.updatedAt = new Date().toISOString();
    await db.put('records', r); toast('Сақталды'); renderRecord(view, go, id);
  };
  view.querySelector('#eRecalc').onclick = async () => {
    const m = await getActiveModel();
    try {
      const v = explain(m, r.dims).value;
      if (!(await confirmSheet('Қайта есептеу', `${m.name} (v${m.version}) бойынша жаңа болжам: ${num(v)} кг. Жазбаны жаңарту керек пе?`, 'Жаңарту'))) return;
      Object.assign(r, { predicted: v, modelId: m.id, modelName: m.name, modelVersion: m.version, formula: m.formula, coeffs: structuredClone(m.coeffs), updatedAt: new Date().toISOString() });
      await db.put('records', r); toast('Жаңартылды'); renderRecord(view, go, id);
    } catch (err) { toast(err.message); }
  };
  view.querySelector('#eRemeasure')?.addEventListener('click', async () => { await loadRecordIntoSession(r); go('#/measure'); });
  view.querySelector('#eDel').onclick = async () => {
    if (!(await confirmSheet('Жазбаны жою', `${r.animalId} жазбасы мен оның суреті біржола жойылады.`, 'Жою', true))) return;
    await db.delete('records', id); toast('Жойылды'); go('#/results');
  };
  return () => { if (viewer) viewer.destroy(); if (url) URL.revokeObjectURL(url); };
}

function aiRecordCard(r) {
  const a = r.aiAssist;
  if (!a) return '';
  if (!a.animal) return `<div class="card"><h3>AI көмекші</h3><p class="small muted">AI бұл суретте жануарды таппады; нүктелер қолмен қойылған.</p></div>`;
  const rows = ['H', 'L', 'D'].map(k => {
    const ai = a.aiDims && a.aiDims[k], fin = r.dims && r.dims[k];
    const d = ai != null && fin != null ? ai - fin : null;
    return `<tr><td>${k} · ${DIMS[k].short}</td><td>${num(ai)}</td><td>${num(fin)}</td><td>${d != null ? (d > 0 ? '+' : '') + num(d) : '—'}</td></tr>`;
  }).join('');
  return `<div class="card">
    <div class="card-row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">AI ұсынысы мен тексерілген өлшем</h3><span class="badge info">зерттеу</span></div>
    <p class="small muted">${esc(a.animal.name)} · сенімділігі ${Math.round(a.animal.score * 100)}% · силуэт ${a.segOk ? 'сенімді' : 'сенімсіз'} · рейка ${a.rodAuto ? 'автоматты табылды' : 'қолмен белгіленді'} · түзетілген нүктелер: ${a.corrected ?? 0}</p>
    <div class="table-wrap"><table><thead><tr><th>Өлшем</th><th>AI, см</th><th>Тексерілген, см</th><th>Айырма, см</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">AI өлшемдері тексерілген рейка масштабымен есептелді — салыстыру тек дене нүктелерінің орнын бағалайды.</p>
  </div>`;
}

// ---------- ЭКСПОРТ ----------
function csvCell(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const csvNum = (v, d = 2) => v == null || !Number.isFinite(v) ? '' : Number(v).toFixed(d).replace('.', ',');

export function exportCSV(recs) {
  if (!recs.length) { toast('Экспорттайтын дерек жоқ'); return; }
  const head = ['ID', 'Күні', 'Әдіс', 'Биіктігі H, см', 'Ұзындығы L, см', 'Дене тереңдігі D, см', 'Масштаб S, см/пиксель', 'Рейка R, см', 'Модель', 'Формула', 'Болжамды салмақ, кг', 'Нақты салмақ, кг', 'Қателік E, кг', 'Қателік E, %', 'Ескертпе', 'AI жануар', 'AI сенімділігі, %', 'H (AI), см', 'L (AI), см', 'D (AI), см', 'AI түзетілген нүктелер'];
  const rows = recs.map(r => {
    const e = recordError(r);
    return [r.animalId, dateStr(r.date), r.method === 'manual' ? 'таспа' : 'фото', csvNum(r.dims?.H), csvNum(r.dims?.L), csvNum(r.dims?.D),
      csvNum(r.scale, 5), csvNum(r.rodLength, 1), r.modelName || '', r.formula || '', csvNum(r.predicted), csvNum(r.actual), csvNum(e?.e), csvNum(e?.ep), r.note || '',
      r.aiAssist?.animal?.name || '', csvNum(r.aiAssist?.animal ? r.aiAssist.animal.score * 100 : null, 0), csvNum(r.aiAssist?.aiDims?.H), csvNum(r.aiAssist?.aiDims?.L), csvNum(r.aiAssist?.aiDims?.D), r.aiAssist?.corrected ?? ''];
  });
  const csv = '﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');
  download(`malmetr-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
  toast('CSV файлы дайын');
}

export async function exportPDF(recs) {
  if (!recs.length) { toast('Экспорттайтын дерек жоқ'); return; }
  const models = await listModels();
  const withAct = recs.filter(r => recordError(r));
  const errs = withAct.map(recordError);
  const mae = errs.length ? errs.reduce((s, x) => s + x.e, 0) / errs.length : null;
  const mape = errs.length ? errs.reduce((s, x) => s + x.ep, 0) / errs.length : null;
  const area = document.getElementById('printArea');
  area.innerHTML = `
    <h1 style="font-size:20pt;margin:0">MalMetr — өлшеу есебі</h1>
    <p style="margin:2px 0 10px">Қой салмағын жанаспай анықтаудың математикалық моделі · ${esc(dateStr(new Date().toISOString()))}</p>
    <p>Жазбалар саны: <b>${recs.length}</b>; нақты салмағы бар: <b>${withAct.length}</b>.
      ${mae != null ? `Орташа абсолют қателік: <b>${num(mae, 2)} кг</b>; орташа пайыздық қателік: <b>${num(mape, 1)}%</b>.` : 'Нақты салмақтар енгізілмегендіктен, модель қателігі есептелмеді.'}</p>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th>ID</th><th>Күні</th><th>H, см</th><th>L, см</th><th>D, см</th><th>Болжамды салмақ, кг</th><th>Нақты салмақ, кг</th><th>Қателік</th><th>Модель</th></tr></thead>
      <tbody>${recs.map(r => { const e = recordError(r); return `<tr><td>${esc(r.animalId)}</td><td>${esc(dateStr(r.date).split(' ')[0])}</td><td>${num(r.dims?.H)}</td><td>${num(r.dims?.L)}</td><td>${num(r.dims?.D)}</td><td>${num(r.predicted)}</td><td>${r.actual != null ? num(r.actual) : ''}</td><td>${e ? num(e.e) + ' кг; ' + num(e.ep) + '%' : ''}</td><td>${esc(r.modelName || '')}</td></tr>`; }).join('')}</tbody>
    </table>
    <h2 style="font-size:13pt;margin-top:14px">Формулалар</h2>
    <p>Масштаб: S = R / P. Қателік: E = |Mболжам − Mнақты|, E% = E / Mнақты · 100%.</p>
    ${models.map(m => `<p><b>${esc(m.name)}</b> (v${m.version}): M = ${esc(m.formula)}; ${m.coeffs.map(c => esc(c.name) + ' = ' + esc(fmt(c.value, 6))).join(', ')}</p>`).join('')}
    <p style="margin-top:12px;font-style:italic">Болжамды салмақ — модельдік есептеу. Нақты өлшеумен тексерілмеген мәндер модельдің дәлдігін дәлелдемейді.</p>`;
  toast('Басып шығару терезесінде «PDF ретінде сақтау» таңдаңыз', 4000);
  setTimeout(() => window.print(), 300);
}

export async function backupJSON() {
  const recs = await db.getAll('records');
  const models = await db.getAll('models');
  const settings = await db.getAll('settings');
  const out = { app: 'MalMetr', format: 1, exportedAt: new Date().toISOString(), records: [], models, settings };
  for (const r of recs) {
    out.records.push({ ...r, photo: r.photo ? await blobToDataURL(r.photo) : null, thumb: r.thumb ? await blobToDataURL(r.thumb) : null });
  }
  download(`malmetr-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out), 'application/json');
  toast('Сақтық көшірме дайын');
}

export async function importJSON(file, done) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'MalMetr' || !Array.isArray(data.records)) throw new Error('Бұл MalMetr көшірмесі емес');
    if (!(await confirmSheet('Деректерді жүктеу', `${data.records.length} жазба және ${data.models?.length || 0} модель қосылады. ID бірдей жазбалар жаңартылады.`, 'Жүктеу'))) return;
    for (const r of data.records) {
      if (!r.id) continue;
      r.photo = typeof r.photo === 'string' ? await dataURLToBlob(r.photo) : null;
      r.thumb = typeof r.thumb === 'string' ? await dataURLToBlob(r.thumb) : null;
      await db.put('records', r);
    }
    for (const m of data.models || []) if (m.id && m.formula) await db.put('models', m);
    for (const s of data.settings || []) if (s.key && s.key !== 'activeModelId') await db.put('settings', s);
    toast('Деректер жүктелді');
    done && done();
  } catch (e) { toast('Жүктеу мүмкін болмады: ' + e.message, 4000); }
}
