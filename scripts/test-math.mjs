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
const A = { formula: TEMPLATES[0].formula, coeffs: TEMPLATES[0].coeffs };
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

console.log('Барлық математикалық тексерістер өтті ✓');
