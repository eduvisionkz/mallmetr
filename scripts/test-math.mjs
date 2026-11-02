// Формулалардың дұрыстығын тексеру: node scripts/test-math.mjs
import assert from 'node:assert/strict';
import { parse, evaluate, coefficientNames } from '../js/expr.js';
import { calibration, computeDims } from '../js/geometry.js';
import { predict, errorStats, fitLinear, TEMPLATES } from '../js/models.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// 1. Масштаб: R = 100 см, P = 400 px → S = 0,25 см/px (тапсырмадағы мысал)
const cal = calibration({ rodTop: { x: 50, y: 100 }, rodBottom: { x: 50, y: 500 } }, 100);
close(cal.P, 400); close(cal.S, 0.25); close(cal.tiltDeg, 0);

// 2. Тік өлшем рейка бағыты бойынша: шоқтық (300;220), жер (310;480) → |Δy| = 260 px → 65 см
const pts = {
  rodTop: { x: 50, y: 100 }, rodBottom: { x: 50, y: 500 },
  withers: { x: 300, y: 220 }, ground: { x: 310, y: 480 },
  shoulder: { x: 260, y: 300 }, pin: { x: 540, y: 300 },
  back: { x: 330, y: 230 }, chest: { x: 330, y: 350 },
};
const m = computeDims(pts, 100);
close(m.dims.H, 65); close(m.dims.L, 70); close(m.dims.D, 30);

// 3. Қисайған рейка: бәрін 30°-қа бұрсақ та, өлшемдер өзгермеуі керек
const rot = (p, a = Math.PI / 6) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
const m2 = computeDims(Object.fromEntries(Object.entries(pts).map(([k, p]) => [k, rot(p)])), 100);
close(m2.dims.H, 65, 1e-6); close(m2.dims.L, 70, 1e-6); close(m2.dims.D, 30, 1e-6);

// 4. Формулалар
const TA = TEMPLATES.find(t => t.key === 'A');
const A = { formula: TA.formula, coeffs: TA.coeffs };
close(predict(A, { H: 65, L: 70, D: 30 }), 0.6 * Math.PI * 900 * 70 / 4000);
assert.deepEqual(coefficientNames(parse('c0 + c1*H + c2*L + c3*D')), ['c0', 'c1', 'c2', 'c3']);
close(evaluate(parse('pow(2;3) + sqrt(16) - 2^-1'), {}), 11.5);

// 5. Қателік: E = |Mболжам − Mнақты|, E% = E / Mнақты · 100
const lin = { formula: 'c0 + c1*H + c2*L + c3*D', coeffs: [{ name: 'c0', value: 0 }, { name: 'c1', value: 0 }, { name: 'c2', value: 0 }, { name: 'c3', value: 1 }] };
const st = errorStats(lin, [{ dims: { H: 1, L: 1, D: 40 }, actual: 50 }, { dims: { H: 1, L: 1, D: 30 }, actual: null }]);
assert.equal(st.n, 1); close(st.mae, 10); close(st.mape, 20);

// 6. Ең кіші квадраттар: M = 5 + 0,2H + 0,3L + 0,5D деректерінен коэффициенттерді қайта табу
const recs = [];
for (let i = 0; i < 12; i++) {
  const H = 55 + i * 2.1, L = 60 + (i * 7) % 23, D = 25 + (i * 5) % 11;
  recs.push({ dims: { H, L, D }, actual: 5 + 0.2 * H + 0.3 * L + 0.5 * D });
}
const fit = fitLinear(recs);
assert.ok(fit.ok);
[5, 0.2, 0.3, 0.5].forEach((v, i) => close(fit.coef[i], v, 1e-6));
assert.equal(fitLinear(recs.slice(0, 3)).ok, false);

// 7. Компьютерлік көру: синтетикалық «қой» (шөп фонында ақ эллипс, бас сол жақта, 4 аяқ) және жолақты рейка
{
  const { segmentAnimal, keypointsFromMask, detectRod } = await import('../js/ai/segment.js');
  const W = 480, H = 360, data = new Uint8ClampedArray(W * H * 4);
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const set = (x, y, r, g, b) => { const i = (y * W + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const n = rnd() * 20; set(x, y, 90 + n, 140 + n, 70 + n); }
  for (let y = 60; y < 300; y++) for (let x = 40; x < 47; x++) Math.floor((y - 60) / 20) % 2 ? set(x, y, 245, 245, 240) : set(x, y, 230, 90, 30);
  const sheep = (x, y) => ((x - 250) ** 2 / 110 ** 2 + (y - 180) ** 2 / 55 ** 2 <= 1) || ((x - 140) ** 2 + (y - 118) ** 2 <= 28 ** 2) ||
    (x > 140 && x < 175 && y > 120 && y < 175) || ([175, 195, 300, 320].some(c => x >= c && x < c + 12) && y > 200 && y < 300);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sheep(x, y)) { const n = rnd() * 15; set(x, y, 225 + n, 220 + n, 205 + n); }
  const img = { data, width: W, height: H };
  const rod = detectRod(img, 'redorange', [108, 86, 256, 216]);
  assert.ok(rod && Math.abs(rod.top.y - 60) <= 2 && Math.abs(rod.top.x - 43) <= 2, 'рейка табылуы керек');
  // соңғы жолағы ақ болса да, рейканың табаны дұрыс табылуы керек (y = 300)
  assert.ok(Math.abs(rod.bottom.y - 300) <= 2, 'рейка табаны: ' + rod.bottom.y);
  const seg = segmentAnimal(img, [108, 86, 256, 216]);
  assert.ok(seg.ok && seg.leakage < 0.05, 'силуэт бөлінуі керек');
  const kp = keypointsFromMask(seg);
  assert.equal(kp.headLeft, true);
  const p = kp.points;
  assert.ok(Math.abs(p.shoulder.x - 142) <= 6, 'иық буыны тұлғаның алдыңғы шетінде');
  assert.ok(Math.abs(p.pin.x - 355) <= 10, 'шонданай тұлғаның артқы шетінде');
  assert.ok(Math.abs(p.ground.y - 299) <= 3, 'жер деңгейі — тұяқ астында');
  assert.ok(p.withers.y >= 125 && p.withers.y <= 145, 'шоқтық — арқа сызығында');
  assert.ok(p.chest.y >= 220 && p.chest.y <= 240, 'кеуде асты — іш сызығында');
  // Бас бағытын қолмен ауыстыру нүктелерді айналдырады
  assert.equal(keypointsFromMask(seg, 'right').headLeft, false);
}

// 8. Оқушының авторлық моделі M = k·L·D² (Еділбай, 15 қой)
{
  const E = await import('../js/edilbay.js');
  assert.equal(E.SHEEP.length, 15);
  close(E.SUM_M, 436.2, 1e-9);
  assert.equal(E.SUM_I, 499776);
  close(E.K, 436.2 / 499776, 1e-18);
  assert.equal(E.K.toFixed(14), '0.00087279101037');
  assert.ok(Math.abs(E.C - 1.111835) < 1e-6, 'c ≈ 1,111835');
  // k мен c шатастырылмауы керек: екі жазу бірдей нәтиже береді
  for (const [, L, D] of E.SHEEP) close(E.predictMass(L, D), E.C * 3.14 * D * D * L / 4000, 1e-9);
  // Тәуелсіз тексеру: 11–15 қойлар (коэффициентті табуға қатыспаған)
  const expected = { 11: 42.63, 12: 32.18, 13: 43.11, 14: 47.71, 15: 51.84 };
  for (const [n, L, D] of E.TEST) assert.equal(E.predictMass(L, D).toFixed(2), expected[n].toFixed(2), `қой №${n}`);
  // Ескі 0,00037 коэффициенті қолданылмайды
  const src = (await import('node:fs')).readFileSync(new URL('../js/edilbay.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('0.00037'));
  // Өлшем жоқ болса — салмақ жоқ
  assert.equal(E.predictMass(null, 27), null);
  assert.equal(E.predictMass(67, 0), null);
}

// 9. Автоматты өлшеу: барлық тексеріс өтсе ғана өлшем беріледі
{
  const { evaluateAuto, findRod, FAIL_MSG } = await import('../js/ai/automeasure.js');
  const { segmentAnimal, keypointsFromMask } = await import('../js/ai/segment.js');
  assert.equal(FAIL_MSG, 'Өлшемдерді автоматты анықтау мүмкін болмады. Қайта түсіріңіз немесе калькуляторды пайдаланыңыз.');
  const W = 480, H = 360;
  const make = (withRod) => {
    const data = new Uint8ClampedArray(W * H * 4);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const set = (x, y, r, g, b) => { const i = (y * W + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const n = rnd() * 20; set(x, y, 90 + n, 140 + n, 70 + n); }
    if (withRod) for (let y = 60; y < 300; y++) for (let x = 40; x < 47; x++) Math.floor((y - 60) / 20) % 2 ? set(x, y, 245, 245, 240) : set(x, y, 230, 90, 30);
    const sheep = (x, y) => ((x - 250) ** 2 / 110 ** 2 + (y - 180) ** 2 / 55 ** 2 <= 1) || ((x - 140) ** 2 + (y - 118) ** 2 <= 28 ** 2) ||
      (x > 140 && x < 175 && y > 120 && y < 175) || ([175, 195, 300, 320].some(c => x >= c && x < c + 12) && y > 200 && y < 300);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sheep(x, y)) { const n = rnd() * 15; set(x, y, 225 + n, 220 + n, 205 + n); }
    return { data, width: W, height: H };
  };
  const box = [108, 86, 256, 216];
  const animal = { cls: 'sheep', name: 'Қой', score: 0.9, bbox: box };
  // а) рейкасы бар толық сурет → өлшемдер табылады
  {
    const img = make(true);
    const rod = findRod(img, box);
    assert.ok(rod, 'рейка табылуы керек');
    const seg = segmentAnimal(img, box), kp = keypointsFromMask(seg);
    const ev = evaluateAuto({ W, H, animal, rod, seg, kp, rodLength: 100 });
    assert.ok(ev.ok, JSON.stringify(ev.checks));
    // рейка 240 px = 100 см → S ≈ 0,417 см/px; тұлға ені ≈ 220 px → L ≈ 85–95 см, D ≈ 110 px → ≈ 40–48 см
    assert.ok(ev.dims.L > 80 && ev.dims.L < 100, 'L = ' + ev.dims.L);
    assert.ok(ev.dims.D > 38 && ev.dims.D < 50, 'D = ' + ev.dims.D);
  }
  // ә) рейка жоқ → өлшем де, салмақ та жоқ
  {
    const img = make(false);
    const rod = findRod(img, box);
    assert.equal(rod, null);
    const seg = segmentAnimal(img, box), kp = keypointsFromMask(seg);
    const ev = evaluateAuto({ W, H, animal, rod, seg, kp, rodLength: 100 });
    assert.equal(ev.ok, false); assert.equal(ev.dims, null);
  }
  // б) жануар табылмаса → өлшем жоқ
  {
    const ev = evaluateAuto({ W, H, animal: null, rod: null, seg: null, kp: null });
    assert.equal(ev.ok, false); assert.equal(ev.dims, null);
  }
  // в) кеуде сызығы сенімсіз болса → өлшем жоқ
  {
    const img = make(true);
    const rod = findRod(img, box), seg = segmentAnimal(img, box), kp = keypointsFromMask(seg);
    const ev = evaluateAuto({ W, H, animal, rod, seg, kp: { ...kp, warnings: ['chest'] } });
    assert.equal(ev.ok, false); assert.equal(ev.dims, null);
  }
  // г) рейка қойдан алыс (басқа деңгейде) тұрса → өлшем жоқ
  {
    const img = make(true);
    const rod = findRod(img, box), seg = segmentAnimal(img, box), kp = keypointsFromMask(seg);
    const far = { ...rod, top: { x: rod.top.x, y: rod.top.y - 120 }, bottom: { x: rod.bottom.x, y: rod.bottom.y - 120 } };
    const ev = evaluateAuto({ W, H, animal, rod: far, seg, kp });
    assert.equal(ev.ok, false);
  }
}

// 10. Бірнеше қой және жабылған қой → өлшем жоқ
{
  const { evaluateAuto, findRod } = await import('../js/ai/automeasure.js');
  const { segmentAnimal, keypointsFromMask } = await import('../js/ai/segment.js');
  const W = 480, H = 360, data = new Uint8ClampedArray(W * H * 4);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const set = (x, y, r, g, b) => { const i = (y * W + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const n = rnd() * 20; set(x, y, 90 + n, 140 + n, 70 + n); }
  for (let y = 60; y < 300; y++) for (let x = 40; x < 47; x++) Math.floor((y - 60) / 20) % 2 ? set(x, y, 245, 245, 240) : set(x, y, 230, 90, 30);
  const sheep = (x, y) => ((x - 250) ** 2 / 110 ** 2 + (y - 180) ** 2 / 55 ** 2 <= 1) || ((x - 140) ** 2 + (y - 118) ** 2 <= 28 ** 2) ||
    (x > 140 && x < 175 && y > 120 && y < 175) || ([175, 195, 300, 320].some(c => x >= c && x < c + 12) && y > 200 && y < 300);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sheep(x, y)) { const n = rnd() * 15; set(x, y, 225 + n, 220 + n, 205 + n); }
  const img = { data, width: W, height: H }, box = [108, 86, 256, 216];
  const animal = { cls: 'sheep', name: 'Қой', score: 0.9, bbox: box };
  const rod = findRod(img, box), seg = segmentAnimal(img, box), kp = keypointsFromMask(seg);
  assert.ok(evaluateAuto({ W, H, animal, rod, seg, kp, others: [] }).ok);
  // алыста тұрған кішкентай адам — кедергі емес
  assert.ok(evaluateAuto({ W, H, animal, rod, seg, kp, others: [{ cls: 'person', name: 'person', score: 0.9, bbox: [400, 40, 30, 80] }] }).ok);
  // тағы бір үлкен қой → бас тарту
  const two = evaluateAuto({ W, H, animal, rod, seg, kp, others: [{ cls: 'sheep', name: 'Қой', score: 0.8, bbox: [300, 120, 170, 160] }] });
  assert.equal(two.ok, false); assert.equal(two.dims, null);
  assert.ok(two.checks.some(c => c.key === 'single' && !c.ok));
  // адам қойды жартылай жауып тұр → бас тарту
  const hid = evaluateAuto({ W, H, animal, rod, seg, kp, others: [{ cls: 'person', name: 'person', score: 0.9, bbox: [200, 60, 90, 280] }] });
  assert.equal(hid.ok, false); assert.equal(hid.dims, null);
  assert.ok(hid.checks.some(c => c.key === 'clear' && !c.ok));
  // Бір формула, бір коэффициент: фото режимі де edilbay.predictMass қолданады
  const fs = await import('node:fs');
  const simpleSrc = fs.readFileSync(new URL('../js/simple.js', import.meta.url), 'utf8');
  assert.ok(simpleSrc.includes("from './edilbay.js'") && (simpleSrc.match(/predictMass\(/g) || []).length >= 2);
}

// 11. Рейка: қисайған, күңгірт, сары рейкалар табылады; ұзындық қатесі < 1,5 %
{
  const { detectRod } = await import('../js/ai/segment.js');
  const scene = (tiltDeg, col, striped, len = 240, width = 7, W = 480, H = 360) => {
    const data = new Uint8ClampedArray(W * H * 4); let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const set = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const n = rnd() * 25; set(x, y, 150 + n, 135 + n, 90 + n); }
    const a = tiltDeg * Math.PI / 180, bx = 80, by = 320;
    for (let t = 0; t < len; t++) for (let w = -width / 2; w < width / 2; w += 0.5) {
      const x = Math.round(bx + Math.sin(a) * t + Math.cos(a) * w), y = Math.round(by - Math.cos(a) * t + Math.sin(a) * w);
      (striped && Math.floor(t / (len / 10)) % 2 === 1) ? set(x, y, 240, 240, 235) : set(x, y, ...col);
    }
    return { data, width: W, height: H };
  };
  for (const [t, col, st, kind] of [[0, [220, 45, 35], true, 'redorange'], [6, [220, 45, 35], true, 'redorange'], [12, [220, 45, 35], true, 'redorange'],
    [8, [170, 60, 45], false, 'redorange'], [5, [235, 200, 40], false, 'yellow'], [10, [40, 90, 200], false, 'blue']]) {
    const r = detectRod(scene(t, col, st), kind, null);
    assert.ok(r, `рейка ${t}° табылуы керек`);
    const L = Math.hypot(r.top.x - r.bottom.x, r.top.y - r.bottom.y);
    assert.ok(Math.abs(L - 240) / 240 < 0.015, `рейка ${t}°: ${L}`);
  }
  // құрғақ шөп фонында сары рейка жоқ болса — жалған рейка табылмауы керек
  assert.equal(detectRod(scene(0, [150, 135, 90], false), 'yellow', null), null);
}

console.log('Барлық математикалық тексерістер өтті ✓');

// ---- Ақ-қара сызғыш (ruler.js) ----
{
  const { detectRuler } = await import('../js/ai/ruler.js');
  const W = 400, H = 300;
  const mk = (fn) => { const d = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = fn(x, y); const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } return { width: W, height: H, data: d }; };
  // 100 см сызғыш: y = 50…250 (200 px), 20 бөлік × 10 px, қара бөліктер x = 200…206, ақ денесі x = 185…206
  const ruler = mk((x, y) => {
    if (x >= 185 && x <= 206 && y >= 45 && y <= 255) {
      if (x >= 200 && y >= 50 && y < 250 && Math.floor((y - 50) / 10) % 2 === 0) return 20;
      return 235;
    }
    return 70 + ((x * 7 + y * 13) % 23);
  });
  const r = detectRuler(ruler);
  assert(r, 'сызғыш табылуы керек');
  const L = Math.hypot(r.bottom.x - r.top.x, r.bottom.y - r.top.y);
  assert(Math.abs(L - 200) <= 4, `100 см = 200 px болуы керек, алынды ${L.toFixed(1)}`);
  assert(Math.abs(r.pxPerCm - 2) < 0.05, 'масштаб 2 px/см');
  // Ақ түтік (бөліксіз) — сызғыш деп саналмауы керек
  const pipe = mk((x, y) => (x >= 190 && x <= 200 && y >= 40 && y <= 260 ? 240 : 70 + ((x * 7 + y * 13) % 23)));
  assert(!detectRuler(pipe), 'бөліксіз ақ түтік сызғыш деп танылмауы керек');
  console.log('Ақ-қара сызғыш: табылды, масштаб дұрыс, ақ түтік — жоқ ✓');
}
