// Суреттен L мен D-ны толық автоматты анықтау.
// Нейрожелі (COCO-SSD) жануарды табады, рейка түсі бойынша, дене шекаралары силуэт бойынша табылады.
// Әр кезең тексеріледі; бір тексеріс өтпесе — нәтиже (салмақ) ШЫҒАРЫЛМАЙДЫ.
import { segmentAnimal, keypointsFromMask, detectRod, ROD_COLORS } from './segment.js';
import { computeDims, dist } from '../geometry.js';

export const FAIL_MSG = 'Өлшемдерді автоматты анықтау мүмкін болмады. Қайта түсіріңіз немесе калькуляторды пайдаланыңыз.';
export const WORK_SIDE = 640;

// Қойға тән өлшемдер ауқымы (ересек Еділбай қошқарын да қамтиды). Одан тыс болса — сенімсіз деп есептеледі.
const LIMITS = { L: [40, 110], D: [15, 50], ratio: [0.25, 0.75] };

// Таза функция (браузерсіз тексеруге болады). Барлық координаталар бір масштабта.
const area = b => Math.max(0, b[2]) * Math.max(0, b[3]);
const inter = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));

// others — суреттегі басқа нысандар (нейрожелі тапқан), негізгі қойдан басқа
export function evaluateAuto({ W, H, animal, rod, seg, kp, rodLength = 100, others = [] }) {
  const checks = [];
  const add = (key, ok, text) => { checks.push({ key, ok, text }); return ok; };

  // 1. Жануар
  let okAnimal = false;
  if (!animal) add('animal', false, 'Суретте қой табылмады');
  else if (animal.cls === 'sheep') okAnimal = add('animal', animal.score >= 0.4, animal.score >= 0.4 ? `Қой табылды (${Math.round(animal.score * 100)}%)` : `Қой анық танылмады (${Math.round(animal.score * 100)}%)`);
  else okAnimal = add('animal', animal.score >= 0.5, animal.score >= 0.5
    ? `Жануар табылды, бірақ модель оны «${animal.name}» деп таныды (${Math.round(animal.score * 100)}%)`
    : `Қой анық танылмады («${animal.name}», ${Math.round(animal.score * 100)}%)`);
  if (okAnimal) {
    const [bx, , bw] = animal.bbox, edge = W * 0.01;
    add('frame', bx > edge && bx + bw < W - edge, bx > edge && bx + bw < W - edge ? 'Қой кадрға толық сыйды' : 'Қой кадрға толық сыймаған');
    // Бірнеше қой: сенімді және көлемі салыстырмалы басқа қой бар ма
    const A = area(animal.bbox);
    const flock = others.filter(o => o.cls === 'sheep' && o.score >= 0.5 && area(o.bbox) >= 0.25 * A);
    add('single', !flock.length, flock.length ? 'Кадрда бірнеше қой бар — бір қойды жеке түсіріңіз' : 'Кадрда бір қой');
    // Жабылу: басқа нысан (адам, жануар, т.б.) қойдың тұлғасының бір бөлігін жауып тұр ма
    const cover = others.filter(o => o.score >= 0.4 && inter(o.bbox, animal.bbox) >= 0.12 * A);
    add('clear', !cover.length, cover.length ? `Қойдың бір бөлігі жабылған (${cover[0].name})` : 'Қой ештеңемен жабылмаған');
  }

  // 2. Рейка
  let cal = null;
  if (!rod) add('rod', false, 'Рейка табылмады (ашық түсті, тік рейка қажет)');
  else {
    add('rod', true, 'Рейка табылды');
    const P = dist(rod.top, rod.bottom);
    add('rodSize', P >= H * 0.15, P >= H * 0.15 ? 'Рейка кадрда жеткілікті үлкен' : 'Рейка кадрда тым кішкентай — жақынырақ түсіріңіз');
    const tilt = Math.abs(Math.atan2(rod.top.x - rod.bottom.x, rod.bottom.y - rod.top.y) * 180 / Math.PI);
    add('rodTilt', tilt <= 20, tilt <= 20 ? 'Рейка тік тұр' : `Рейка ${Math.round(tilt)}°-қа қисайған — тік ұстаңыз`);
    if (okAnimal) {
      const [, by, , bh] = animal.bbox;
      const near = Math.abs(rod.bottom.y - (by + bh)) <= 0.25 * bh;
      const ratio = P / bh;
      add('rodPlace', near && ratio >= 0.6 && ratio <= 3,
        near && ratio >= 0.6 && ratio <= 3 ? 'Рейка қоймен бір деңгейде тұр' : 'Рейка қоймен бір қатарда тұрмаған сияқты');
    }
  }

  // 3. Силуэт және дене шекаралары
  if (okAnimal) {
    add('seg', !!(seg && seg.ok), seg && seg.ok ? 'Қойдың сұлбасы бөлінді' : 'Қойдың сұлбасы фоннан анық бөлінбеді');
    const bodyOk = !!(kp && !kp.warnings.includes('chest'));
    add('body', bodyOk, bodyOk ? 'Дене шекаралары табылды' : 'Арқа мен құрсақ сызығы анық табылмады');
  }

  const points = {};
  if (rod) { points.rodTop = rod.top; points.rodBottom = rod.bottom; }
  if (kp) Object.assign(points, kp.points);
  let dims = null;
  if (checks.every(c => c.ok)) {
    const m = computeDims(points, rodLength);
    cal = m.cal;
    dims = { L: m.dims.L, D: m.dims.D };
    const plausible = dims.L >= LIMITS.L[0] && dims.L <= LIMITS.L[1] && dims.D >= LIMITS.D[0] && dims.D <= LIMITS.D[1]
      && dims.D / dims.L >= LIMITS.ratio[0] && dims.D / dims.L <= LIMITS.ratio[1];
    add('dims', plausible, plausible ? 'Өлшемдер қойға тән' : 'Табылған өлшемдер қойға тән емес');
    if (!plausible) dims = null;
  }
  const ok = checks.every(c => c.ok);
  return { ok, checks, points, dims: ok ? dims : null, cal: ok ? cal : null, headLeft: kp ? kp.headLeft : null };
}

// Рейкаларды барлық түстер бойынша іздеп, ең сенімдісін таңдау
export function findRod(data, animalBox) {
  const cands = [];
  for (const color of Object.keys(ROD_COLORS)) {
    const r = detectRod(data, color, animalBox);
    if (r) cands.push({ ...r, color, P: dist(r.top, r.bottom) });
  }
  if (!cands.length) return null;
  if (animalBox) {
    const ground = animalBox[1] + animalBox[3];
    const score = c => -Math.abs(c.bottom.y - ground) / animalBox[3] + c.P / data.height;
    cands.sort((a, b) => score(b) - score(a));
  } else cands.sort((a, b) => b.P - a.P);
  return cands[0];
}

// Браузерде: толық автоматты өлшеу. detector — ai/detector.js (модель жүктелген болуы керек)
export async function autoMeasure(detector, img, width, height, { rodLength = 100, headSide = 'auto' } = {}) {
  const k = Math.min(1, WORK_SIDE / Math.max(width, height));
  const w = Math.round(width * k), h = Math.round(height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const all = await detector.detectAll(c, 20);
  const dets = all.filter(d => d.animal);
  const sheep = dets.filter(d => d.cls === 'sheep').sort((a, b) => b.score - a.score)[0];
  const animal = sheep || dets.sort((a, b) => b.score - a.score)[0] || null;
  const others = all.filter(d => d !== animal);
  const data = ctx.getImageData(0, 0, w, h);
  const rod = findRod(data, animal ? animal.bbox : null);

  let seg = null, kp = null;
  if (animal) {
    let excl = null;
    if (rod) {
      excl = new Uint8Array(w * h);
      const pad = 4, x0 = Math.min(rod.top.x, rod.bottom.x) - pad, x1 = Math.max(rod.top.x, rod.bottom.x) + pad;
      for (let y = Math.max(0, Math.floor(rod.top.y - pad)); y < Math.min(h, rod.bottom.y + pad); y++)
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) excl[y * w + x] = 1;
    }
    seg = segmentAnimal(data, animal.bbox, excl);
    kp = keypointsFromMask(seg, headSide);
  }
  const ev = evaluateAuto({ W: w, H: h, animal, rod, seg, kp, rodLength, others });

  // Координаталарды бастапқы сурет өлшеміне қайтару
  const up = p => ({ x: p.x / k, y: p.y / k });
  const points = Object.fromEntries(Object.entries(ev.points).map(([key, p]) => [key, up(p)]));
  return {
    ...ev, points,
    animal: animal ? { ...animal, bbox: animal.bbox.map(v => v / k) } : null,
    rodColor: rod ? rod.color : null,
    overlay: seg ? maskOverlay(seg, k) : null,
    _seg: seg, _k: k, _W: w, _H: h, _others: others,
  };
}

// Бас бағытын ауыстырып, тек нүктелерді қайта есептеу (силуэт қайта бөлінбейді)
export function reevaluateHead(res, headSide, rodLength) {
  if (!res._seg) return res;
  const k = res._k;
  const down = p => ({ x: p.x * k, y: p.y * k }), up = p => ({ x: p.x / k, y: p.y / k });
  const kp = keypointsFromMask(res._seg, headSide);
  const animal = res.animal ? { ...res.animal, bbox: res.animal.bbox.map(v => v * k) } : null;
  const rod = res.points.rodTop ? { top: down(res.points.rodTop), bottom: down(res.points.rodBottom) } : null;
  const ev = evaluateAuto({ W: res._W, H: res._H, animal, rod, seg: res._seg, kp, rodLength, others: res._others || [] });
  return { ...res, ...ev, _headSide: headSide, points: Object.fromEntries(Object.entries(ev.points).map(([key, p]) => [key, up(p)])) };
}

// Рейка табылмаса: пайдаланушы суретте рейканың екі ұшын белгілейді (бастапқы сурет координаталары),
// қалғаны (қой, сұлба, L, D) бұрынғыдай автоматты тексеріледі
export function withManualRod(res, top, bottom, rodLength) {
  const k = res._k;
  const down = p => ({ x: p.x * k, y: p.y * k }), up = p => ({ x: p.x / k, y: p.y / k });
  const t = down(top.y <= bottom.y ? top : bottom), b = down(top.y <= bottom.y ? bottom : top);
  const kp = res._seg ? keypointsFromMask(res._seg, res._headSide || 'auto') : null;
  const animal = res.animal ? { ...res.animal, bbox: res.animal.bbox.map(v => v * k) } : null;
  const ev = evaluateAuto({ W: res._W, H: res._H, animal, rod: { top: t, bottom: b }, seg: res._seg, kp, rodLength, others: res._others || [] });
  return { ...res, ...ev, manualRod: true, points: Object.fromEntries(Object.entries(ev.points).map(([key, p]) => [key, up(p)])) };
}

// Тек рейкаға қатысты тексеріс өтпеді ме (қой, сұлба, дене шекаралары табылды)
export function onlyRodFailed(res) {
  const ROD = ['rod', 'rodSize', 'rodTilt', 'rodPlace'];
  const failed = (res.checks || []).filter(c => !c.ok).map(c => c.key);
  const keys = (res.checks || []).map(c => c.key);
  return failed.length > 0 && failed.every(k => ROD.includes(k)) && keys.includes('body') && !!res._seg;
}

function maskOverlay(seg, k) {
  const c = document.createElement('canvas');
  c.width = seg.w; c.height = seg.h;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(seg.w, seg.h);
  for (let i = 0; i < seg.mask.length; i++) if (seg.mask[i]) { const j = i * 4; id.data[j] = 110; id.data[j + 1] = 124; id.data[j + 2] = 18; id.data[j + 3] = 255; }
  ctx.putImageData(id, 0, 0);
  return { canvas: c, x: seg.x0 / k, y: seg.y0 / k, w: seg.w / k, h: seg.h / k };
}
