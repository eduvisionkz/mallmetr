// Классикалық компьютерлік көру алгоритмдері (нейрожеліге тәуелсіз, офлайн):
//  1) детектор берген тіктөртбұрыш ішінде жануар силуэтін түс бойынша бөлу;
//  2) силуэт бойынша өлшеу нүктелерін ҰСЫНУ (эвристика — міндетті түрде адам тексереді);
//  3) өлшеу рейкасын түсі бойынша табу.
// Барлық функциялар таза: { data, width, height } (ImageData пішімі) қабылдайды.

// ---------- Түс кеңістігі ----------
function srgbToLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const LIN = new Float32Array(256).map((_, i) => srgbToLin(i));
function fLab(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
export function rgbToLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

const LW = 0.5; // жарықтыққа (көлеңкеге) сезімталдықты азайту
function dist2(a, b) { const dl = (a[0] - b[0]) * LW, da = a[1] - b[1], db = a[2] - b[2]; return dl * dl + da * da + db * db; }

// Детерминирленген k-орташалар (кездейсоқтықсыз: бастапқы центрлер — k-means++ ұқсас ең алыс нүктелер)
export function kmeans(points, k, iters = 8) {
  if (!points.length) return [];
  k = Math.min(k, points.length);
  const centers = [points[Math.floor(points.length / 2)].slice()];
  while (centers.length < k) {
    let best = null, bd = -1;
    for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 600))) {
      const p = points[i];
      let d = Infinity; for (const c of centers) d = Math.min(d, dist2(p, c));
      if (d > bd) { bd = d; best = p; }
    }
    centers.push(best.slice());
  }
  for (let it = 0; it < iters; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < centers.length; j++) { const d = dist2(p, centers[j]); if (d < bd) { bd = d; bi = j; } }
      const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    sum.forEach((s, j) => { if (s[3]) centers[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  return centers;
}
const nearest = (p, cs) => { let d = Infinity; for (const c of cs) d = Math.min(d, dist2(p, c)); return d; };

// ---------- Морфология (екілік маска) ----------
function dilate(m, w, h, r) {
  const t = new Uint8Array(m.length), o = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w && m[y * w + xx]) v = 1; } t[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h && t[yy * w + x]) v = 1; } o[y * w + x] = v;
  }
  return o;
}
function erode(m, w, h, r) {
  const inv = m.map(v => v ? 0 : 1);
  return dilate(inv, w, h, r).map(v => v ? 0 : 1);
}

// Ең үлкен байланысқан аймақ (4-көршілік)
export function largestComponent(m, w, h) {
  const lab = new Int32Array(m.length);
  let best = 0, bestN = 0, id = 0;
  const stack = new Int32Array(m.length);
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || lab[i]) continue;
    id++; let sp = 0, n = 0; stack[sp++] = i; lab[i] = id;
    while (sp) {
      const j = stack[--sp]; n++;
      const x = j % w, y = (j / w) | 0;
      if (x > 0 && m[j - 1] && !lab[j - 1]) { lab[j - 1] = id; stack[sp++] = j - 1; }
      if (x < w - 1 && m[j + 1] && !lab[j + 1]) { lab[j + 1] = id; stack[sp++] = j + 1; }
      if (y > 0 && m[j - w] && !lab[j - w]) { lab[j - w] = id; stack[sp++] = j - w; }
      if (y < h - 1 && m[j + w] && !lab[j + w]) { lab[j + w] = id; stack[sp++] = j + w; }
    }
    if (n > bestN) { bestN = n; best = id; }
  }
  return { mask: lab.map(v => v === best && best ? 1 : 0), area: bestN };
}

// Ішкі тесіктерді толтыру (шетінен қол жетпейтін фон — силуэттің бөлігі)
function fillHoles(m, w, h) {
  const reach = new Uint8Array(m.length);
  const stack = [];
  const push = i => { if (!m[i] && !reach[i]) { reach[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const j = stack.pop(), x = j % w, y = (j / w) | 0;
    if (x > 0) push(j - 1); if (x < w - 1) push(j + 1); if (y > 0) push(j - w); if (y < h - 1) push(j + w);
  }
  return m.map((v, i) => v || !reach[i] ? 1 : 0);
}

// ---------- 1. Силуэтті бөлу ----------
// img: ImageData; bbox: [x, y, w, h] сол суреттің координаталарында; exclude: рейка маскасы (міндетті емес)
export function segmentAnimal(img, bbox, exclude = null) {
  const { width: W, height: H, data } = img;
  let [bx, by, bw, bh] = bbox.map(Math.round);
  bx = Math.max(0, bx); by = Math.max(0, by); bw = Math.min(W - bx, bw); bh = Math.min(H - by, bh);
  const mx = Math.round(bw * 0.12), my = Math.round(bh * 0.12);
  const ox0 = Math.max(0, bx - mx), oy0 = Math.max(0, by - my), ox1 = Math.min(W, bx + bw + mx), oy1 = Math.min(H, by + bh + my);
  const lab = (x, y) => { const i = (y * W + x) * 4; return rgbToLab(data[i], data[i + 1], data[i + 2]); };
  const excl = (x, y) => exclude && exclude[y * W + x];

  // Фон үлгілері — тіктөртбұрыштың сыртындағы сақина; аз болса, тіктөртбұрыштың шеткі жолағы
  const bg = [];
  const step = Math.max(1, Math.round(Math.sqrt(((ox1 - ox0) * (oy1 - oy0)) / 20000)));
  for (let y = oy0; y < oy1; y += step) for (let x = ox0; x < ox1; x += step) {
    const inside = x >= bx && x < bx + bw && y >= by && y < by + bh;
    if (!inside && !excl(x, y)) bg.push(lab(x, y));
  }
  if (bg.length < 300) {
    const band = Math.max(2, Math.round(Math.min(bw, bh) * 0.03));
    for (let y = by; y < by + bh; y += step) for (let x = bx; x < bx + bw; x += step) {
      const edge = x < bx + band || x >= bx + bw - band || y < by + band;
      if (edge && !excl(x, y)) bg.push(lab(x, y));
    }
  }
  // Жануар үлгілері — тұлғаның ортаңғы бөлігі (аяқтар мен бастан аулақ)
  const fg = [];
  for (let y = Math.round(by + bh * 0.22); y < by + bh * 0.58; y += step) for (let x = Math.round(bx + bw * 0.28); x < bx + bw * 0.72; x += step) {
    if (!excl(x, y)) fg.push(lab(x, y));
  }
  const bgC = kmeans(bg, 5);
  // Жануар үлгісіне түсіп қалған фон түстерін алып тастау (мысалы, аяқтар арасындағы шөп)
  let spread = 0; for (const p of bg) spread += nearest(p, bgC); spread /= Math.max(1, bg.length);
  const tau = Math.max(64, 3 * spread);
  let fgC = kmeans(fg, 4).filter(c => nearest(c, bgC) > tau);
  if (!fgC.length) { const all = kmeans(fg, 4); fgC = [all.reduce((a, c) => nearest(c, bgC) > nearest(a, bgC) ? c : a)]; }

  // Әр пиксельді жіктеу (тіктөртбұрыштан сәл кеңірек аймақта)
  const pad = Math.round(Math.max(bw, bh) * 0.03);
  const rx0 = Math.max(0, bx - pad), ry0 = Math.max(0, by - pad), rx1 = Math.min(W, bx + bw + pad), ry1 = Math.min(H, by + bh + pad);
  const w = rx1 - rx0, h = ry1 - ry0;
  let m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + rx0, Y = y + ry0;
    if (excl(X, Y)) continue;
    const p = lab(X, Y);
    if (nearest(p, fgC) < nearest(p, bgC) * 0.85) m[y * w + x] = 1;
  }
  const r = Math.max(1, Math.round(Math.min(w, h) / 120));
  m = erode(dilate(m, w, h, r + 1), w, h, r + 1); // жабу
  m = dilate(erode(m, w, h, r), w, h, r);         // ашу
  const lc = largestComponent(m, w, h);
  m = fillHoles(lc.mask, w, h);

  // Сапа көрсеткіштері
  let area = 0; for (const v of m) area += v;
  const fill = area / (bw * bh);
  let leak = 0, ring = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + rx0, Y = y + ry0;
    if (X < bx || X >= bx + bw || Y < by || Y >= by + bh) { ring++; leak += m[y * w + x]; }
  }
  const leakage = ring ? leak / ring : 0;
  const ok = fill > 0.25 && fill < 0.92 && leakage < 0.35;
  return { mask: m, x0: rx0, y0: ry0, w, h, fill, leakage, ok };
}

// ---------- 2. Нүктелерді ұсыну ----------
function median(a) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }
function pct(a, q) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }

// headSide: 'left' | 'right' | 'auto'. Қайтарады: суреттің координаталарындағы нүктелер.
// Тәсіл: тұлғаны көлденең жолақ ретінде табамыз (ең кең жолдар), содан кейін әр бағанда
// осы жолақты қиып өтетін сегментті ғана аламыз — силуэтке жабысқан артық бөліктер әсер етпейді.
export function keypointsFromMask(seg, headSide = 'auto') {
  const { mask: m, w, h, x0, y0 } = seg;
  const at = (x, y) => m[y * w + x];
  // 1) жол бойынша ені → тұлға жолағы
  const rowCnt = new Int32Array(h);
  for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) c += at(x, y); rowCnt[y] = c; }
  let ym = 0; for (let y = 1; y < h; y++) if (rowCnt[y] > rowCnt[ym]) ym = y;
  if (rowCnt[ym] < 10) return null;
  let yb0 = ym, yb1 = ym;
  while (yb0 > 0 && rowCnt[yb0 - 1] >= 0.5 * rowCnt[ym]) yb0--;
  while (yb1 < h - 1 && rowCnt[yb1 + 1] >= 0.5 * rowCnt[ym]) yb1++;
  const ymid = Math.round((yb0 + yb1) / 2);
  // 2) ортаңғы жолдағы ең ұзын сегмент → тұлғаның көлденең шекарасы
  const rowRuns = y => { const r = []; let x = 0; while (x < w) { while (x < w && !at(x, y)) x++; if (x >= w) break; const a = x; while (x < w && at(x, y)) x++; r.push([a, x - 1]); } return r; };
  const longest = y => rowRuns(y).reduce((b, r) => (!b || r[1] - r[0] > b[1] - b[0]) ? r : b, null);
  const midRun = longest(ymid);
  if (!midRun || midRun[1] - midRun[0] < 10) return null;
  const [b0, b1] = midRun;
  // 3) әр бағанда ymid жолын қиып өтетін тік сегмент
  const colSeg = x => {
    x = Math.max(0, Math.min(w - 1, Math.round(x)));
    let yy = ymid;
    if (!at(x, yy)) { let d = 1; while (d < h && !(yy - d >= 0 && at(x, yy - d)) && !(yy + d < h && at(x, yy + d))) d++; if (d >= h * 0.25) return null; yy = yy - d >= 0 && at(x, yy - d) ? yy - d : yy + d; }
    let a = yy, b = yy; while (a > 0 && at(x, a - 1)) a--; while (b < h - 1 && at(x, b + 1)) b++;
    return { top: a, bot: b };
  };
  const span = b1 - b0;
  const central = []; for (let x = Math.round(b0 + 0.35 * span); x <= b0 + 0.65 * span; x++) { const c = colSeg(x); if (c) central.push(c); }
  if (!central.length) return null;
  const topMed = median(central.map(c => c.top));
  const bellyMed = median(central.map(c => c.bot));
  const depth = Math.max(4, bellyMed - topMed);
  // 4) бас жағы: тұлғадан тыс, іш сызығынан жоғары орналасқан масса (бас+мойын) көп жақ
  let mL = 0, mR = 0;
  for (let y = 0; y <= Math.min(h - 1, bellyMed); y++) for (let x = 0; x < w; x++) if (at(x, y)) { if (x < b0) mL++; else if (x > b1) mR++; }
  const autoLeft = mL >= mR;
  const headLeft = headSide === 'auto' ? autoLeft : headSide === 'left';
  const dir = headLeft ? 1 : -1;
  const cx = Math.round((b0 + b1) / 2);
  const runAt = yf => { // берілген биіктіктегі, тұлға ортасын қамтитын көлденең сегмент
    const y = Math.max(0, Math.min(h - 1, Math.round(yf)));
    const rs = rowRuns(y); if (!rs.length) return null;
    let best = rs.find(r => r[0] <= cx && r[1] >= cx);
    if (!best) best = rs.reduce((b, r) => Math.abs((r[0] + r[1]) / 2 - cx) < Math.abs((b[0] + b[1]) / 2 - cx) ? r : b);
    return [best[0], best[1], y];
  };
  const sRow = runAt(topMed + 0.55 * depth), pRow = runAt(topMed + 0.3 * depth);
  if (!sRow || !pRow) return null;
  const xs = headLeft ? sRow[0] : sRow[1], ys = sRow[2];
  const xp = headLeft ? pRow[1] : pRow[0], yp = pRow[2];
  const L = Math.abs(xp - xs);
  if (L < 10) return null;
  const colAt = f => Math.max(0, Math.min(w - 1, Math.round(xs + dir * f * L)));
  const warnings = [];

  const xw = colAt(0.2); const cw = colSeg(xw);
  let yw = cw ? cw.top : topMed;
  if (!cw || yw < topMed - 0.35 * depth || yw > topMed + 0.3 * depth) { yw = topMed; warnings.push('withers'); }
  const xb = colAt(0.27); const cb = colSeg(xb); const yb = cb && Math.abs(cb.top - topMed) < 0.35 * depth ? cb.top : topMed;
  // Кеуде асты: бағанмен төмен түсеміз; аяқ басталған жерде көлденең ені күрт азаяды — сол жерде тоқтаймыз
  const xc = colAt(0.3); const cc = colSeg(xc);
  const bodyW = b1 - b0;
  const widthAt = (x, y) => { if (!at(x, y)) return 0; let a = x, b = x; while (a > 0 && at(a - 1, y)) a--; while (b < w - 1 && at(b + 1, y)) b++; return b - a + 1; };
  let yc = cc ? cc.bot : bellyMed;
  if (cc) {
    const y0s = Math.round(topMed + 0.5 * depth);
    for (let y = Math.max(cc.top, y0s); y <= cc.bot; y++) if (widthAt(xc, y) < 0.4 * bodyW) { yc = y - 1; break; }
  }
  if (!cc || yc > topMed + 1.3 * depth || yc < topMed + 0.6 * depth) { yc = Math.round(Math.max(bellyMed, topMed + 0.9 * depth)); warnings.push('chest'); }
  let yg = -1;
  for (let f = -0.05; f <= 0.35; f += 0.01) { const x = colAt(f); for (let y = h - 1; y > yg; y--) if (at(x, y)) { yg = y; break; } }
  if (yg <= bellyMed) { warnings.push('ground'); yg = Math.min(h - 1, Math.round(bellyMed + depth)); }

  const P = (x, y) => ({ x: x + x0, y: y + y0 });
  return {
    headLeft, autoLeft, warnings,
    points: {
      shoulder: P(xs, ys), pin: P(xp, yp),
      withers: P(xw, yw), ground: P(xw, yg),
      back: P(xb, yb), chest: P(xc, yc),
    },
  };
}

// ---------- 3. Рейканы түсі бойынша табу ----------
export const ROD_COLORS = {
  redorange: { name: 'Қызыл / қызғылт сары', test: (h, s, v) => (h < 30 || h > 335) && s > 0.5 && v > 0.38 },
  yellow: { name: 'Сары', test: (h, s, v) => h >= 40 && h <= 68 && s > 0.55 && v > 0.5 },
  blue: { name: 'Көк', test: (h, s, v) => h >= 185 && h <= 255 && s > 0.35 && v > 0.2 },
};

// Рейканы түсі бойынша табу. Аймақтың бағыты бас осьтер (моменттер) арқылы есептеледі,
// сондықтан сәл қисайған рейка да табылады; ұзындығы мен ені осы бағыт бойынша өлшенеді.
export function detectRod(img, color = 'redorange', avoidBox = null) {
  const { width: W, height: H, data } = img;
  const test = (ROD_COLORS[color] || ROD_COLORS.redorange).test;
  const hsvAt = (x, y) => { const i = (y * W + x) * 4; return rgbToHsv(data[i], data[i + 1], data[i + 2]); };
  const isCol = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const [h, s, v] = hsvAt(x, y); return test(h, s, v); };
  const isWhite = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const [, s, v] = hsvAt(x, y); return s < 0.28 && v > 0.58; };

  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isCol(x, y)) m[y * W + x] = 1;
  // Көлденең 1 px кеңейту (қисайған жолақтар бір-бірімен жалғансын) + тік бағытта үзілістерді жабу (ақ-қызыл жолақтар)
  const md = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x] || (x > 0 && m[y * W + x - 1]) || (x < W - 1 && m[y * W + x + 1])) md[y * W + x] = 1;
  const g = Math.max(2, Math.round(H * 0.12));
  for (let x = 0; x < W; x++) {
    let last = -1;
    for (let y = 0; y < H; y++) if (md[y * W + x]) { if (last >= 0 && y - last > 1 && y - last <= g) for (let k = last + 1; k < y; k++) md[k * W + x] = 1; last = y; }
  }
  // Байланысқан аймақтар және олардың моменттері
  const lab = new Int32Array(W * H); const stack = new Int32Array(W * H); const comps = []; let id = 0;
  for (let i = 0; i < md.length; i++) {
    if (!md[i] || lab[i]) continue;
    id++; let sp = 0; stack[sp++] = i; lab[i] = id;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    while (sp) {
      const j = stack[--sp], x = j % W, y = (j / W) | 0;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const k = yy * W + xx; if (md[k] && !lab[k]) { lab[k] = id; stack[sp++] = k; }
      }
    }
    if (maxY - minY < H * 0.1) continue;
    const mx = sx / n, my = sy / n;
    const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(0.05, tr / 2 - disc);
    let ux = cxy, uy = l1 - cxx; // бас осьтің бағыты
    if (Math.abs(ux) < 1e-9 && Math.abs(uy) < 1e-9) { ux = 0; uy = 1; }
    const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul;
    if (uy < 0) { ux = -ux; uy = -uy; } // төмен қарай
    const len = Math.sqrt(12 * l1), wid = Math.max(1, Math.sqrt(12 * l2));
    const tilt = Math.acos(Math.min(1, Math.abs(uy))) * 180 / Math.PI;
    comps.push({ id, n, mx, my, ux, uy, len, wid, tilt, minX, maxX, minY, maxY });
  }
  let best = null;
  for (const c of comps) {
    if (c.len < H * 0.15 || c.len / c.wid < 6 || c.tilt > 25 || c.n < 0.45 * c.len * c.wid) continue;
    if (avoidBox) {
      const [ax, ay, aw, ah] = avoidBox;
      // Жануардың өз денесіндегі тік бөліктер (мысалы, қоңыр аяқ) рейка деп саналмайды
      if (c.mx > ax + aw * 0.03 && c.mx < ax + aw * 0.97 && c.minY >= ay - 0.05 * ah) continue;
    }
    if (!best || c.len > best.len) best = c;
  }
  if (!best) return null;

  // Ұштар: бас ось бойындағы ең шеткі нүктелер
  let tmin = Infinity, tmax = -Infinity;
  for (let y = best.minY; y <= best.maxY; y++) for (let x = best.minX; x <= best.maxX; x++) {
    if (lab[y * W + x] !== best.id) continue;
    const t = (x - best.mx) * best.ux + (y - best.my) * best.uy;
    if (t < tmin) tmin = t; if (t > tmax) tmax = t;
  }
  const at = t => ({ x: best.mx + t * best.ux, y: best.my + t * best.uy });
  // Жолақты рейка: ось бойымен түсті/ақ жолақтарды санап, ұштағы ақ жолақты қосу
  const px = { x: -best.uy, y: best.ux }; // көлденең бағыт
  const sample = (t, fn) => { const p = at(t); let k = 0; for (const o of [-1, 0, 1]) if (fn(Math.round(p.x + o * px.x), Math.round(p.y + o * px.y))) k++; return k >= 2; };
  const runs = []; let cur = null, rl = 0;
  for (let t = tmin; t <= tmax; t++) { const c = sample(t, isCol); if (c === cur) rl++; else { if (cur !== null) runs.push([cur, rl]); cur = c; rl = 1; } }
  if (cur !== null) runs.push([cur, rl]);
  const colRuns = runs.filter(r => r[0] && r[1] >= 2).map(r => r[1]).sort((a, b) => a - b);
  let striped = false;
  if (colRuns.length >= 2 && runs.some(r => !r[0] && r[1] >= 2)) {
    striped = true;
    const stripe = colRuns[colRuns.length >> 1];
    const whiteRun = (t0, dir) => {
      let n = 0, skip = 0, t = t0;
      while (skip < 2 && !sample(t, isWhite)) { skip++; t += dir; if (t < -H || t > H) break; }
      for (; n <= 1.5 * stripe; t += dir) { if (sample(t, isWhite)) n++; else break; }
      return n ? n + skip : 0;
    };
    const up = whiteRun(tmin - 1, -1), down = whiteRun(tmax + 1, 1);
    if (up >= 0.6 * stripe && up <= 1.4 * stripe) tmin -= up;
    if (down >= 0.6 * stripe && down <= 1.4 * stripe) tmax += down;
  }
  const top = at(tmin), bottom = at(tmax + 1);
  return { top, bottom, aspect: (tmax - tmin) / best.wid, striped, tilt: best.tilt };
}
