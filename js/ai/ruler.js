// Ақ-қара бөліктері бар өлшеу сызғышын (рейканы) табу.
// Түске емес, құрылымға сүйенеді: рейканың шетінде қара және ақ бөліктер бірдей қадаммен
// кезектесіп тұрады. Мұндай мерзімді «жолақ» қой жүнінде, қабырғада, киімде сирек кездеседі,
// сондықтан күндіз де, түнде жарқылмен (вспышка) түсірілген суретте де, қара-ақ суретте де табылады.

// Сызғыштағы бір қара немесе ақ бөліктің ұзындығы (см). Жобадағы 100 см рейкада 20 бөлік бар.
export const CM_PER_SEGMENT = 5;
const MIN_SEGMENTS = 14, MIN_CONTRAST = 60;
const ANGLES = [];
for (let a = -10; a <= 10; a += 1) ANGLES.push(a * Math.PI / 180);

function grayOf(img) {
  const { width: W, height: H, data } = img;
  const g = new Float32Array(W * H);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return g;
}

// Бір сызық бойындағы профиль бойынша ең ұзын мерзімді тізбекті табу
function bestChain(prof, H) {
  const n = prof.length;
  // Жергілікті орта (жылжымалы терезе) — жарықтың біркелкі еместігін жою
  const w = Math.max(9, Math.round(H * 0.06)) | 1, half = w >> 1;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + prof[i];
  const runs = []; // [isDark, start, len, sum]
  let cur = -1, start = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half), b = Math.min(n, i + half + 1);
    const avg = (pre[b] - pre[a]) / (b - a);
    const d = prof[i] < avg ? 1 : 0;
    if (d !== cur) { if (cur >= 0) runs.push([cur, start, i - start, sum]); cur = d; start = i; sum = 0; }
    sum += prof[i];
  }
  if (cur >= 0) runs.push([cur, start, n - start, sum]);

  const minL = H * 0.012, maxL = H * 0.09;
  let best = null;
  for (let s = 0; s < runs.length; s++) {
    if (runs[s][2] < minL || runs[s][2] > maxL) continue;
    const lens = [runs[s][2]];
    let e = s;
    while (e + 1 < runs.length) {
      const r = runs[e + 1];
      const med = lens.slice().sort((x, y) => x - y)[lens.length >> 1];
      if (r[2] < 0.55 * med || r[2] > 1.8 * med || r[2] < minL || r[2] > maxL) break;
      lens.push(r[2]); e++;
    }
    const cnt = e - s + 1;
    if (cnt < 6) continue;
    // Қара мен ақ бөліктердің контрасты
    let dS = 0, dN = 0, lS = 0, lN = 0;
    for (let k = s; k <= e; k++) { const r = runs[k]; if (r[0]) { dS += r[3]; dN += r[2]; } else { lS += r[3]; lN += r[2]; } }
    const contrast = lN && dN ? lS / lN - dS / dN : 0;
    if (contrast < 35) continue;
    const sorted = lens.slice().sort((x, y) => x - y);
    const med = sorted[sorted.length >> 1];
    const spread = lens.reduce((t, l) => t + Math.abs(l - med), 0) / lens.length / med; // біркелкілік
    const score = cnt * (1 - Math.min(0.6, spread)) * Math.min(1.5, contrast / 80);
    if (!best || score > best.score) {
      // Қадамды ең кіші квадраттар әдісімен табу: шекаралар y_k ≈ a + p·k (пиксельден дәлірек)
      const ys = []; for (let k = s; k <= e; k++) ys.push(runs[k][1]); ys.push(runs[e][1] + runs[e][2]);
      const m = ys.length, mk = (m - 1) / 2, my = ys.reduce((t, v) => t + v, 0) / m;
      let num = 0, den = 0; ys.forEach((v, k) => { num += (k - mk) * (v - my); den += (k - mk) * (k - mk); });
      best = { score, cnt, y0: ys[0], y1: ys[m - 1], med, period: num / den, contrast, spread };
    }
  }
  return best;
}

// Нәтиже: { top:{x,y}, bottom:{x,y}, segments, period, tilt, score } немесе null.
// top/bottom — табылған жолақты бөліктің ұштары (рейканың өзі одан сәл ұзын болуы мүмкін).
export function detectRuler(img, rodLengthCm = 100) {
  const { width: W, height: H } = img;
  const g = grayOf(img);
  let best = null;
  const prof = new Float32Array(H);
  for (const ang of ANGLES) {
    const t = Math.tan(ang), yc = H / 2;
    for (let x0 = 2; x0 < W - 2; x0 += 1) {
      let ok = true;
      for (let y = 0; y < H; y++) {
        const x = Math.round(x0 + (y - yc) * t);
        if (x < 1 || x >= W - 1) { prof[y] = prof[y > 0 ? y - 1 : 0]; ok = ok && true; continue; }
        const i = y * W + x;
        prof[y] = (g[i - 1] + g[i] + g[i + 1]) / 3;
      }
      const c = bestChain(prof, H);
      if (c && (!best || c.score > best.score)) best = { ...c, x0, ang };
    }
  }
  // Сенімділік шарттары: кемінде 14 кезектесетін бөлік және айқын контраст.
  // (Бір ғана түтік, күрте тігістері, қабырға сызаттары бұл шартқа сирек сәйкес келеді.)
  if (!best || best.cnt < MIN_SEGMENTS || best.contrast < MIN_CONTRAST) return null;
  const t = Math.tan(best.ang), yc = H / 2, cos = Math.cos(best.ang);
  const at = y => ({ x: best.x0 + (y - yc) * t, y });
  const p = best.period / cos; // бір бөліктің сызық бойындағы ұзындығы, px
  // 100 см рейка = 100 / CM_PER_SEGMENT бөлік; ұштарын жолақ ортасынан симметриялы қоямыз
  const half = (rodLengthCm / CM_PER_SEGMENT) * best.period / 2;
  const mid = (best.y0 + best.y1) / 2;
  return {
    top: at(mid - half), bottom: at(mid + half),
    stripeTop: at(best.y0), stripeBottom: at(best.y1),
    segments: best.cnt, period: p, pxPerCm: p / CM_PER_SEGMENT,
    tilt: Math.abs(best.ang * 180 / Math.PI), score: best.score, contrast: best.contrast, spread: best.spread,
    kind: 'ruler',
  };
}

// Браузерде: бастапқы суреттен (img элементі) сызғышты іздеу. Координаталар бастапқы сурет пикселдерінде.
// AI модельді қажет етпейді, сондықтан интернетсіз де, қолмен өлшеу бетінде де жұмыс істейді.
export function findRulerOnImage(img, width, height, rodLengthCm = 100, side = 640) {
  const k = Math.min(1, side / Math.max(width, height));
  const w = Math.round(width * k), h = Math.round(height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const r = detectRuler(ctx.getImageData(0, 0, w, h), rodLengthCm);
  if (!r) return null;
  const up = p => ({ x: p.x / k, y: p.y / k });
  return { ...r, top: up(r.top), bottom: up(r.bottom), stripeTop: up(r.stripeTop), stripeBottom: up(r.stripeBottom), period: r.period / k, pxPerCm: r.pxPerCm / k };
}

// Силуэтті бөлгенде рейканың өзін (ақ денесін де) қойдан алып тастау маскасы.
// Сызғышта қара бөліктер оң жақ шетте, ақ денесі солға қарай шамамен 2 бөлік енінде.
export function rodExclusion(rod, w, h) {
  const m = new Uint8Array(w * h);
  const ruler = rod.kind === 'ruler';
  const left = ruler ? 2.2 * rod.period : 4, right = ruler ? 0.8 * rod.period : 4, pad = ruler ? rod.period : 4;
  const y0 = Math.max(0, Math.floor(Math.min(rod.top.y, rod.bottom.y) - pad));
  const y1 = Math.min(h, Math.ceil(Math.max(rod.top.y, rod.bottom.y) + pad));
  const dy = rod.bottom.y - rod.top.y || 1;
  for (let y = y0; y < y1; y++) {
    const cx = rod.top.x + (rod.bottom.x - rod.top.x) * (y - rod.top.y) / dy;
    for (let x = Math.max(0, Math.floor(cx - left)); x < Math.min(w, Math.ceil(cx + right)); x++) m[y * w + x] = 1;
  }
  return m;
}
