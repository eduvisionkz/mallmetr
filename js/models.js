// Математикалық модельдер: сақтау, есептеу, қателікті талдау, ең кіші квадраттар әдісі
import { db, uid } from './db.js';
import { parse, evaluate, steps, render, coefficientNames, fmt } from './expr.js';
import { K as EDILBAY_K } from './edilbay.js';

// Бастапқы үлгілер. Коэффициенттер — МОДЕЛЬДІК, нақты өлшеумен тексерілмеген.
export const TEMPLATES = [
  {
    key: 'E', name: 'Авторлық модель — Еділбай',
    formula: 'k*L*D^2',
    coeffs: [{ name: 'k', value: EDILBAY_K, min: 0.0005, max: 0.0012, step: 0.000001 }],
    note: 'Оқушының авторлық моделі: M = k·L·D². k = 436,2 / 499 776 ≈ 0,00087279 — 15 қойдың алғашқы 10-ы бойынша есептелді, қалған 5 қой тәуелсіз тексеруге алынды. Еділбай тұқымды қойлар бойынша жасалған зерттеу моделі.',
    verified: true,
  },
  {
    key: 'A', name: 'A модель — цилиндр',
    formula: 'k*pi*D^2*L/4000',
    coeffs: [{ name: 'k', value: 0.6, min: 0.2, max: 1.2, step: 0.01 }],
    note: 'Тұлғаны диаметрі D, ұзындығы L цилиндрге ұқсатамыз: V = π·D²·L/4 (см³). Тығыздықты ≈1 г/см³ деп алып, 1000-ға бөлеміз (кг). k — пішін коэффициенті (модельдік мән).',
  },
  {
    key: 'B', name: 'B модель — өлшемдер көбейтіндісі',
    formula: 'a*H*L*D',
    coeffs: [{ name: 'a', value: 0.00033, min: 0.0001, max: 0.0008, step: 0.00001 }],
    note: 'Салмақ үш өлшемнің көбейтіндісіне (көлемге ұқсас шамаға) пропорционал деген болжам. a — пропорционалдық коэффициенті (модельдік мән).',
  },
  {
    key: 'C', name: 'C модель — сызықтық',
    formula: 'c0 + c1*H + c2*L + c3*D',
    coeffs: [
      { name: 'c0', value: -60, min: -150, max: 50, step: 1 },
      { name: 'c1', value: 0.4, min: -2, max: 3, step: 0.01 },
      { name: 'c2', value: 0.6, min: -2, max: 3, step: 0.01 },
      { name: 'c3', value: 1.0, min: -2, max: 4, step: 0.01 },
    ],
    note: 'Салмақ әр өлшемге сызықты тәуелді деген болжам. Нақты салмақтар жеткілікті болғанда коэффициенттерді ең кіші квадраттар әдісімен табуға болады.',
  },
];

// 2.3.1 нұсқасы: авторлық модельдің коэффициентін жаңарту және оны бір рет белсенді ету
// (бұрын пайдаланушы А модельді таңдап қалдыруы мүмкін еді, соның салдарынан k = 0,6 қолданылды)
async function migrateTo231(list) {
  if (await db.getSetting('migrated231', false)) return list;
  const e = list.find(m => m.id === 'model-E');
  if (e) {
    const cur = e.coeffs && e.coeffs[0] && e.coeffs[0].value;
    if (cur !== EDILBAY_K) {
      e.coeffs = structuredClone(TEMPLATES[0].coeffs);
      e.updatedAt = new Date().toISOString();
      await db.put('models', e);
    }
    await db.setSetting('activeModelId', 'model-E');
  }
  await db.setSetting('migrated231', true);
  return db.getAll('models');
}

export async function ensureModels() {
  const list0 = await db.getAll('models');
  const list = list0.length ? await migrateTo231(list0) : list0;
  if (list.length) {
    // 2.0 нұсқасына көшу: авторлық модельді қосып, оны белсенді ету (бұрынғы модельдер сақталады)
    if (!list.some(m => m.id === 'model-E')) {
      const t = TEMPLATES[0], now = new Date().toISOString();
      await db.put('models', { id: 'model-E', name: t.name, formula: t.formula, coeffs: structuredClone(t.coeffs), note: t.note, version: 1, history: [], createdAt: now, updatedAt: now, verified: true });
      await db.setSetting('activeModelId', 'model-E');
      return db.getAll('models');
    }
    return list;
  }
  const now = new Date().toISOString();
  for (const t of TEMPLATES) {
    const m = {
      id: 'model-' + t.key, name: t.name, formula: t.formula, coeffs: structuredClone(t.coeffs), note: t.note,
      version: 1, history: [], createdAt: now, updatedAt: now, verified: !!t.verified,
    };
    await db.put('models', m);
  }
  await db.setSetting('activeModelId', 'model-E');
  return db.getAll('models');
}

export async function listModels() {
  const l = await ensureModels();
  return l.sort((a, b) => a.name.localeCompare(b.name, 'kk'));
}

export async function getActiveModel() {
  const models = await listModels();
  const id = await db.getSetting('activeModelId', models[0]?.id);
  return models.find(m => m.id === id) || models[0];
}

export function newModel() {
  const now = new Date().toISOString();
  return { id: uid('model-'), name: 'Авторлық модель', formula: 'k*H*L*D', coeffs: [{ name: 'k', value: 0.0003, min: 0, max: 0.001, step: 0.00001 }], note: '', version: 1, history: [], createdAt: now, updatedAt: now, verified: false };
}

// Формуладағы коэффициенттер тізімін синхрондау
export function syncCoeffs(model) {
  const ast = parse(model.formula);
  const names = coefficientNames(ast);
  const old = new Map(model.coeffs.map(c => [c.name, c]));
  model.coeffs = names.map(n => old.get(n) || { name: n, value: 1, min: -10, max: 10, step: 0.01 });
  return model;
}

// Модельдің жаңа нұсқасын сақтау (алдыңғы нұсқа тарихта қалады)
export async function saveModelVersion(model) {
  const prev = await db.get('models', model.id);
  if (prev) {
    model.history = [...(prev.history || []), { version: prev.version, formula: prev.formula, coeffs: prev.coeffs, savedAt: prev.updatedAt }].slice(-30);
    model.version = (prev.version || 1) + 1;
  }
  model.updatedAt = new Date().toISOString();
  await db.put('models', model);
  return model;
}

export function coeffEnv(model) {
  const env = {};
  for (const c of model.coeffs) env[c.name] = Number(c.value);
  return env;
}

export function predict(model, dims) {
  try {
    const ast = parse(model.formula);
    const v = evaluate(ast, { ...coeffEnv(model), H: dims.H, L: dims.L, D: dims.D });
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

// Толық түсіндірмелі есептеу
export function explain(model, dims) {
  const ast = parse(model.formula);
  const env = { ...coeffEnv(model), H: dims.H, L: dims.L, D: dims.D };
  const value = evaluate(ast, env);
  return {
    formula: 'M = ' + render(ast),
    substitution: 'M = ' + render(ast, env),
    steps: steps(ast, env).map(s => `${s.expr} = ${fmt(s.value, 6)}`),
    value,
  };
}

// Қателіктер: тек нақты салмақ енгізілген жазбалар бойынша
export function errorStats(model, records) {
  const rows = [];
  for (const r of records) {
    if (r.actual == null || !r.dims) continue;
    const p = predict(model, r.dims);
    if (p == null) continue;
    const e = Math.abs(p - r.actual);
    rows.push({ id: r.id, pred: p, actual: r.actual, e, ep: r.actual ? e / r.actual * 100 : null });
  }
  if (!rows.length) return { n: 0, rows };
  const n = rows.length;
  const mae = rows.reduce((s, x) => s + x.e, 0) / n;
  const mape = rows.reduce((s, x) => s + (x.ep ?? 0), 0) / n;
  const rmse = Math.sqrt(rows.reduce((s, x) => s + x.e * x.e, 0) / n);
  const mean = rows.reduce((s, x) => s + x.actual, 0) / n;
  const ssTot = rows.reduce((s, x) => s + (x.actual - mean) ** 2, 0);
  const ssRes = rows.reduce((s, x) => s + (x.actual - x.pred) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
  return { n, rows, mae, mape, rmse, r2 };
}

// Ең кіші квадраттар әдісі: M = c0 + c1·H + c2·L + c3·D
export function fitLinear(records) {
  const data = records.filter(r => r.actual != null && r.dims && [r.dims.H, r.dims.L, r.dims.D].every(Number.isFinite));
  const n = data.length;
  if (n < 5) return { ok: false, n, reason: 'Кемінде 5 нақты салмағы бар жазба қажет' };
  const X = data.map(r => [1, r.dims.H, r.dims.L, r.dims.D]);
  const y = data.map(r => r.actual);
  const k = 4;
  const A = Array.from({ length: k }, () => Array(k + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) A[a][b] += X[i][a] * X[i][b];
      A[a][k] += X[i][a] * y[i];
    }
  }
  // Гаусс әдісі (жетекші элементті таңдаумен)
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return { ok: false, n, reason: 'Деректер жеткіліксіз немесе өлшемдер бір-біріне тым тәуелді' };
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  const coef = A.map((row, i) => row[k] / row[i]);
  return { ok: true, n, coef };
}

export { fmt };
