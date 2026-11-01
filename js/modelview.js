// «МАТЕМАТИКАЛЫҚ МОДЕЛЬ» және «МОДЕЛЬ ҚҰРАСТЫРУ» бөлімдері
import { db } from './db.js';
import { listModels, getActiveModel, explain, predict, errorStats, fitLinear, newModel, syncCoeffs, saveModelVersion, fmt } from './models.js';
import { parse, render } from './expr.js';
import { ICONS, esc, num, parseNum, toast, openSheet, confirmSheet, dateStr } from './ui.js';
import { lineChart, SERIES_COLORS } from './charts.js';

const DISCLAIMER = 'Модельдік есептеу. Нақты өлшеумен тексерілмеген.';

function explainHTML(ex, dims) {
  return `
    <div class="math">
      <div class="lbl">1. Бастапқы өлшемдер</div>
      <div class="row">H = ${num(dims.H)} см;  L = ${num(dims.L)} см;  D = ${num(dims.D)} см</div>
      <div class="lbl">2. Формула</div>
      <div class="row">${esc(ex.formula)}</div>
      <div class="lbl">3. Мәндерді қою</div>
      <div class="row">${esc(ex.substitution)}</div>
      <div class="lbl">4. Аралық есептеулер</div>
      ${ex.steps.map(s => `<div class="row">${esc(s)}</div>`).join('')}
      <div class="lbl">5. Нәтиже</div>
      <div class="row"><b>M ≈ ${num(ex.value)} кг</b></div>
    </div>`;
}

export async function renderModel(view) {
  const model = await getActiveModel();
  const dims = (await db.getSetting('calcDims')) || { H: 65, L: 70, D: 30 };
  const records = await db.getAll('records');
  const withActual = records.filter(r => r.actual != null).length;
  let formulaText = '';
  try { formulaText = 'M = ' + render(parse(model.formula)); } catch { formulaText = model.formula; }

  view.innerHTML = `
    <div class="eyebrow">Математикалық модель</div>
    <h2 style="margin-bottom:12px">Салмақты болжау</h2>

    <div class="card">
      <div class="card-row" style="justify-content:space-between;margin-bottom:8px">
        <b>${esc(model.name)}</b>
        <span class="badge">v${model.version}</span>
      </div>
      <div class="formula">${esc(formulaText)}</div>
      <div style="margin:10px 0 6px"><span class="badge warn">Модельдік коэффициенттер — тексерілмеген</span></div>
      <div class="small mono">${model.coeffs.map(c => `${esc(c.name)} = ${esc(fmt(c.value, 6))}`).join(';  ') || 'коэффициент жоқ'}</div>
      ${model.note ? `<p class="small muted" style="margin-top:10px">${esc(model.note)}</p>` : ''}
      <a class="btn block" href="#/builder" style="margin-top:8px">${ICONS.builder} МОДЕЛЬ ҚҰРАСТЫРУ</a>
    </div>

    <div class="card">
      <h3>Калькулятор</h3>
      <div class="grid-3">
        <div class="field"><label for="cH">H, см</label><input class="input num" id="cH" inputmode="decimal" value="${num(dims.H)}"></div>
        <div class="field"><label for="cL">L, см</label><input class="input num" id="cL" inputmode="decimal" value="${num(dims.L)}"></div>
        <div class="field"><label for="cD">D, см</label><input class="input num" id="cD" inputmode="decimal" value="${num(dims.D)}"></div>
      </div>
      <div id="calcOut"></div>
    </div>

    <div class="card">
      <h3>Өлшеу математикасы</h3>
      <div class="math">
        <div class="lbl">Масштаб (рейка бойынша)</div>
        <div class="row">S = R / P   [см/пиксель]</div>
        <div class="row" style="color:var(--muted)">R — рейканың нақты ұзындығы, P — суреттегі ұзындығы</div>
        <div class="lbl">Пиксельден сантиметрге</div>
        <div class="row">X(см) = X(пиксель) · S</div>
        <div class="lbl">Тік өлшемдер (H, D)</div>
        <div class="row">h = |(A − B) · u|,  u — рейка бағытындағы бірлік вектор</div>
        <div class="lbl">Қиғаш ұзындық (L)</div>
        <div class="row">l = √((x₂ − x₁)² + (y₂ − y₁)²)</div>
        <div class="lbl">Модель қателігі</div>
        <div class="row">E = |Mболжам − Mнақты|</div>
        <div class="row">E% = E / Mнақты · 100%</div>
      </div>
      <p class="small muted" style="margin-top:10px">Нақты салмағы енгізілген жазбалар: <b>${withActual}</b>. ${withActual ? 'Модель қателігі «Зерттеу зертханасы» бөлімінде есептеледі.' : 'Модельдің дәлдігі туралы қорытынды жасау үшін таразымен өлшенген деректер қажет.'}</p>
    </div>`;

  const out = view.querySelector('#calcOut');
  const ids = ['#cH', '#cL', '#cD'];
  function calc() {
    const d = { H: parseNum(view.querySelector('#cH').value), L: parseNum(view.querySelector('#cL').value), D: parseNum(view.querySelector('#cD').value) };
    if (![d.H, d.L, d.D].every(v => v > 0)) { out.innerHTML = '<p class="muted small">Үш өлшемді де енгізіңіз.</p>'; return; }
    db.setSetting('calcDims', d);
    try {
      const ex = explain(model, d);
      out.innerHTML = `
        <div class="result-big">
          <div class="k">БОЛЖАМДЫ САЛМАҚ</div>
          <div class="v">${num(ex.value)} кг</div>
          <div class="disclaimer">${DISCLAIMER}</div>
        </div>${explainHTML(ex, d)}`;
    } catch (e) { out.innerHTML = `<div class="note">Формулада қате: ${esc(e.message)}</div>`; }
  }
  ids.forEach(s => view.querySelector(s).addEventListener('input', calc));
  calc();
}

export async function renderBuilder(view) {
  let models = await listModels();
  const activeId = await db.getSetting('activeModelId');
  let selId = (await db.getSetting('builderSel')) || activeId || models[0].id;
  let sel = structuredClone(models.find(m => m.id === selId) || models[0]);
  let dirty = false;
  let test = (await db.getSetting('builderDims')) || { H: 65, L: 70, D: 30 };
  let param = 'L';
  const records = await db.getAll('records');
  const RANGES = { H: [30, 110], L: [30, 130], D: [15, 60] };

  function modelsWithEdit() { return models.map(m => m.id === sel.id ? sel : m); }

  function draw() {
    let formulaErr = null;
    try { parse(sel.formula); } catch (e) { formulaErr = e.message; }
    const curActive = activeId;
    view.innerHTML = `
      <div class="eyebrow">Модель құрастыру</div>
      <h2 style="margin-bottom:12px">Модельдерді салыстыру</h2>

      <div class="def-nav" id="mTabs">
        ${models.map((m, i) => `<button class="${m.id === sel.id ? 'active' : ''}" data-id="${m.id}" style="width:auto;padding:0 12px">${esc(m.name.split('—')[0].trim() || 'Модель ' + (i + 1))}</button>`).join('')}
        <button id="mNew" style="width:auto;padding:0 12px">+ Жаңа</button>
      </div>

      <div class="card">
        <div class="field"><label for="mName">Атауы</label><input class="input" id="mName" value="${esc(sel.name)}"></div>
        <div class="field">
          <label for="mFormula">Формула (айнымалылар: H, L, D)</label>
          <input class="input mono" id="mFormula" value="${esc(sel.formula)}" autocapitalize="off" autocomplete="off" spellcheck="false">
          <span class="small muted">Амалдар: + − * / ^ ( ); функциялар: sqrt, cbrt, exp, ln, pow(a; b); тұрақты: pi. Басқа әріптер — коэффициенттер.</span>
          ${formulaErr ? `<div class="note" style="margin:6px 0 0">${esc(formulaErr)}</div>` : ''}
        </div>
        <div style="margin-bottom:8px"><span class="badge warn">Коэффициенттер модельдік</span> ${sel.id === curActive ? '<span class="badge ok">Белсенді модель</span>' : ''} ${dirty ? '<span class="badge info">Сақталмаған өзгеріс</span>' : ''}</div>
        <div id="coeffs">
          ${sel.coeffs.map((c, i) => `
            <div class="field">
              <label>${esc(c.name)} = <span class="mono" data-cv="${i}">${esc(fmt(c.value, 6))}</span></label>
              <input type="range" data-ci="${i}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}" aria-label="${esc(c.name)}">
              <div class="grid-3">
                <input class="input num" data-cmin="${i}" inputmode="decimal" value="${String(c.min)}" aria-label="ең кіші">
                <input class="input num" data-cval="${i}" inputmode="decimal" value="${String(c.value)}" aria-label="мәні">
                <input class="input num" data-cmax="${i}" inputmode="decimal" value="${String(c.max)}" aria-label="ең үлкен">
              </div>
            </div>`).join('') || '<p class="small muted">Формулада коэффициент жоқ.</p>'}
        </div>
        <div class="field"><label for="mNote">Түсіндірме</label><textarea class="input" id="mNote">${esc(sel.note || '')}</textarea></div>
        <div class="btn-row">
          <button class="btn primary" id="mSave" ${formulaErr ? 'disabled' : ''}>${ICONS.save} Нұсқаны сақтау</button>
          <button class="btn" id="mActive" ${sel.id === curActive || formulaErr ? 'disabled' : ''}>${ICONS.check} Белсенді ету</button>
        </div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn sm" id="mHist">Нұсқалар тарихы (${(sel.history || []).length})</button>
          <button class="btn sm" id="mCopy">Көшірме жасау</button>
          <button class="btn sm danger" id="mDel" ${models.length < 2 ? 'disabled' : ''}>${ICONS.trash} Жою</button>
        </div>
      </div>

      <div class="card">
        <h3>Сынақ өлшемдері</h3>
        ${['H', 'L', 'D'].map(k => `
          <div class="field">
            <label>${k} = <span class="num" data-tv="${k}">${num(test[k])}</span> см</label>
            <input type="range" data-t="${k}" min="${RANGES[k][0]}" max="${RANGES[k][1]}" step="0.5" value="${test[k]}">
          </div>`).join('')}
        <div class="table-wrap">
          <table><thead><tr><th>Модель</th><th>Болжам, кг</th><th>Айырма*</th></tr></thead><tbody id="predBody"></tbody></table>
        </div>
        <p class="small muted" style="margin-top:6px">* Таңдалған модельмен салыстырғандағы айырма. ${DISCLAIMER}</p>
      </div>

      <div class="card">
        <div class="card-row" style="justify-content:space-between">
          <h3 style="margin:0">Тәуелділік графигі</h3>
          <select class="input" id="pSel" style="width:auto;min-height:38px">
            ${['H', 'L', 'D'].map(k => `<option value="${k}" ${k === param ? 'selected' : ''}>M(${k})</option>`).join('')}
          </select>
        </div>
        <canvas class="chart" id="depChart"></canvas>
        <div class="legend" id="depLegend"></div>
        <p class="small muted">Қалған екі өлшем сынақ мәндерінде тұрақты. Пунктир — ағымдағы мән.</p>
      </div>

      <div class="card" id="errCard"></div>`;

    bind();
    updateLive();
    renderErrors();
  }

  function updateLive() {
    const all = modelsWithEdit();
    const base = predict(sel, test);
    view.querySelector('#predBody').innerHTML = all.map((m, i) => {
      const p = predict(m, test);
      const diff = p != null && base != null && m.id !== sel.id ? p - base : null;
      return `<tr><td><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${SERIES_COLORS[i % 6]};margin-right:6px"></i>${esc(m.name)}</td>
        <td>${p != null ? num(p) : '—'}</td><td>${m.id === sel.id ? '—' : diff != null ? (diff > 0 ? '+' : '') + num(diff) : '—'}</td></tr>`;
    }).join('');
    const [lo, hi] = RANGES[param];
    const series = all.map((m, i) => {
      const pts = [];
      for (let x = lo; x <= hi; x += (hi - lo) / 60) pts.push([x, predict(m, { ...test, [param]: x })]);
      return { name: m.name, color: SERIES_COLORS[i % 6], points: pts };
    });
    lineChart(view.querySelector('#depChart'), series, { xLabel: param + ', см', yLabel: 'M, кг', marker: test[param] });
    view.querySelector('#depLegend').innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
  }

  function renderErrors() {
    const card = view.querySelector('#errCard');
    const all = modelsWithEdit();
    const n = records.filter(r => r.actual != null).length;
    if (!n) {
      card.innerHTML = `<h3>Модельдер қателігі</h3>
        <p class="muted small">Нақты (таразымен өлшенген) салмақ енгізілген жазба әлі жоқ. Сондықтан тек модельдік есептеулер мен болжамдар айырмасы көрсетіледі.</p>`;
      return;
    }
    const stats = all.map(m => ({ m, s: errorStats(m, records) }));
    const isLinear = /^\s*\w+\s*\+\s*\w+\s*\*\s*H\s*\+\s*\w+\s*\*\s*L\s*\+\s*\w+\s*\*\s*D\s*$/.test(sel.formula);
    card.innerHTML = `<h3>Модельдер қателігі (n = ${n})</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Модель</th><th>MAE, кг</th><th>MAPE, %</th><th>RMSE, кг</th><th>R²</th></tr></thead>
        <tbody>${stats.map(({ m, s }) => `<tr><td>${esc(m.name)}</td><td>${s.n ? num(s.mae, 2) : '—'}</td><td>${s.n ? num(s.mape, 1) : '—'}</td><td>${s.n ? num(s.rmse, 2) : '—'}</td><td>${s.r2 != null ? num(s.r2, 3) : '—'}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="small muted" style="margin-top:6px">MAE — орташа абсолют қателік, MAPE — орташа пайыздық қателік. Деректер аз болса, қорытынды сенімсіз.</p>
      ${isLinear ? `<button class="btn block" id="mFit" style="margin-top:6px">Ең кіші квадраттар әдісімен коэффициенттерді табу</button>` : ''}`;
    const fitBtn = card.querySelector('#mFit');
    if (fitBtn) fitBtn.onclick = () => {
      const r = fitLinear(records);
      if (!r.ok) { toast(r.reason); return; }
      const names = parse(sel.formula);
      // c0 + c1*H + c2*L + c3*D түріндегі атаулар реті бойынша
      const order = [];
      (function walk(n) { if (n.t === 'var' && !['H', 'L', 'D'].includes(n.v)) order.push(n.v); if (n.a) walk(n.a); if (n.b) walk(n.b); })(names);
      order.forEach((nm, i) => {
        const c = sel.coeffs.find(x => x.name === nm);
        if (c) { c.value = +r.coef[i].toPrecision(6); c.min = Math.min(c.min, c.value); c.max = Math.max(c.max, c.value); }
      });
      sel.note = (sel.note ? sel.note + '\n' : '') + `Коэффициенттер ${r.n} жазба бойынша ең кіші квадраттар әдісімен табылды (${dateStr(new Date().toISOString())}). Бұл да модельдік нәтиже: жаңа деректермен тексеру қажет.`;
      dirty = true; draw();
      toast(`${r.n} жазба бойынша есептелді`);
    };
  }

  function bind() {
    const q = s => view.querySelector(s);
    view.querySelectorAll('#mTabs [data-id]').forEach(b => b.onclick = async () => {
      if (dirty && !(await confirmSheet('Өзгерістер сақталмаған', 'Басқа модельге өтсеңіз, өзгерістер жоғалады.', 'Жалғастыру'))) return;
      sel = structuredClone(models.find(m => m.id === b.dataset.id)); dirty = false;
      db.setSetting('builderSel', sel.id); draw();
    });
    q('#mNew').onclick = async () => {
      const m = newModel(); m.name = 'Авторлық модель ' + (models.length + 1);
      await db.put('models', m); models = await listModels();
      sel = structuredClone(m); dirty = false; db.setSetting('builderSel', m.id); draw();
    };
    q('#mName').oninput = e => { sel.name = e.target.value; dirty = true; };
    q('#mNote').oninput = e => { sel.note = e.target.value; dirty = true; };
    q('#mFormula').onchange = e => {
      sel.formula = e.target.value.trim(); dirty = true;
      try { syncCoeffs(sel); } catch {}
      draw();
    };
    view.querySelectorAll('[data-ci]').forEach(r => r.oninput = () => {
      const i = +r.dataset.ci; sel.coeffs[i].value = +r.value; dirty = true;
      view.querySelector(`[data-cv="${i}"]`).textContent = fmt(+r.value, 6);
      view.querySelector(`[data-cval="${i}"]`).value = r.value;
      updateLive();
    });
    view.querySelectorAll('[data-cval]').forEach(inp => inp.onchange = () => {
      const i = +inp.dataset.cval, v = parseNum(inp.value);
      if (v == null) return;
      const c = sel.coeffs[i]; c.value = v; c.min = Math.min(c.min, v); c.max = Math.max(c.max, v); dirty = true; draw();
    });
    view.querySelectorAll('[data-cmin],[data-cmax]').forEach(inp => inp.onchange = () => {
      const isMin = 'cmin' in inp.dataset, i = +(inp.dataset.cmin ?? inp.dataset.cmax), v = parseNum(inp.value);
      if (v == null) return;
      const c = sel.coeffs[i];
      if (isMin) c.min = v; else c.max = v;
      if (c.min >= c.max) { toast('Ең кіші мән ең үлкен мәннен кіші болуы керек'); return draw(); }
      c.step = +((c.max - c.min) / 200).toPrecision(2);
      dirty = true; draw();
    });
    view.querySelectorAll('[data-t]').forEach(r => r.oninput = () => {
      test[r.dataset.t] = +r.value;
      view.querySelector(`[data-tv="${r.dataset.t}"]`).textContent = num(+r.value);
      db.setSetting('builderDims', test);
      updateLive();
    });
    q('#pSel').onchange = e => { param = e.target.value; updateLive(); };
    q('#mSave').onclick = async () => {
      await saveModelVersion(sel); models = await listModels(); sel = structuredClone(models.find(m => m.id === sel.id)); dirty = false;
      toast(`Сақталды: v${sel.version}`); draw();
    };
    q('#mActive').onclick = async () => {
      if (dirty) { await saveModelVersion(sel); models = await listModels(); sel = structuredClone(models.find(m => m.id === sel.id)); dirty = false; }
      await db.setSetting('activeModelId', sel.id);
      toast('Белсенді модель өзгертілді');
      renderBuilder(view);
    };
    q('#mCopy').onclick = async () => {
      const m = { ...newModel(), name: sel.name + ' (көшірме)', formula: sel.formula, coeffs: structuredClone(sel.coeffs), note: sel.note };
      await db.put('models', m); models = await listModels(); sel = structuredClone(m); dirty = false; db.setSetting('builderSel', m.id); draw();
    };
    q('#mDel').onclick = async () => {
      if (!(await confirmSheet('Модельді жою', `«${sel.name}» жойылады. Бұрын сақталған өлшеулерде оның формуласы сақталып қалады.`, 'Жою', true))) return;
      await db.delete('models', sel.id);
      models = await listModels();
      if (sel.id === activeId) await db.setSetting('activeModelId', models[0].id);
      sel = structuredClone(models[0]); dirty = false; db.setSetting('builderSel', sel.id);
      renderBuilder(view);
    };
    q('#mHist').onclick = () => {
      const h = [...(sel.history || [])].reverse();
      openSheet(`<h2>Нұсқалар тарихы</h2>
        ${h.length ? `<div class="list">${h.map((v, i) => `
          <div class="card flat" style="margin:0">
            <div class="card-row" style="justify-content:space-between"><b>v${v.version}</b><span class="small muted">${dateStr(v.savedAt)}</span></div>
            <div class="formula" style="margin:8px 0">${esc(v.formula)}</div>
            <div class="small mono">${v.coeffs.map(c => `${esc(c.name)} = ${esc(fmt(c.value, 6))}`).join(';  ')}</div>
            <button class="btn sm" data-restore="${i}" style="margin-top:8px">Осы нұсқаны қайтару</button>
          </div>`).join('')}</div>` : '<p class="muted">Алдыңғы нұсқалар жоқ. «Нұсқаны сақтау» басылған сайын алдыңғы нұсқа осында сақталады.</p>'}
        <button class="btn block" data-close style="margin-top:12px">Жабу</button>`, (body, close) => {
        body.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => {
          const v = h[+b.dataset.restore];
          sel.formula = v.formula; sel.coeffs = structuredClone(v.coeffs); dirty = true;
          close(); draw(); toast(`v${v.version} жүктелді — сақтауды ұмытпаңыз`);
        });
      });
    };
  }

  draw();
  const onResize = () => updateLive();
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
