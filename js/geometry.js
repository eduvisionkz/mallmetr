// Өлшеу нүктелері және геометриялық есептеулер
export const POINTS = [
  { key: 'rodTop', label: 'Рейканың жоғарғы ұшы', short: 'Рейка ұшы', color: '#F2A33A', group: 'rod' },
  { key: 'rodBottom', label: 'Рейканың табаны (жерге тиген жері)', short: 'Рейка табаны', color: '#F2A33A', group: 'rod' },
  { key: 'withers', label: 'Шоқтық — жауырын үстіндегі ең биік нүкте', short: 'Шоқтық', color: '#2BD3C1', group: 'H' },
  { key: 'ground', label: 'Алдыңғы тұяқ тұрған жер деңгейі', short: 'Жер деңгейі', color: '#2BD3C1', group: 'H' },
  { key: 'shoulder', label: 'Иық буынының алдыңғы шығыңқы нүктесі', short: 'Иық буыны', color: '#4FA8E8', group: 'L' },
  { key: 'pin', label: 'Шонданай төмпешігі — тұлғаның артқы нүктесі', short: 'Шонданай', color: '#4FA8E8', group: 'L' },
  { key: 'back', label: 'Шоқтықтың сәл артындағы арқа сызығы', short: 'Арқа', color: '#E07AF0', group: 'D' },
  { key: 'chest', label: 'Алдыңғы аяқтың артындағы кеуде асты (аяқсыз)', short: 'Кеуде асты', color: '#E07AF0', group: 'D' },
];
export const CAL_KEYS = ['rodTop', 'rodBottom'];
export const BODY_KEYS = ['withers', 'ground', 'shoulder', 'pin', 'back', 'chest'];
export const POINT = Object.fromEntries(POINTS.map(p => [p.key, p]));

export const DIMS = {
  H: { name: 'Шоқтықтағы биіктік', short: 'Биіктігі', a: 'withers', b: 'ground', mode: 'vertical' },
  L: { name: 'Тұрқының қиғаш ұзындығы', short: 'Ұзындығы', a: 'shoulder', b: 'pin', mode: 'direct' },
  D: { name: 'Дене тереңдігі', short: 'Дене тереңдігі', a: 'back', b: 'chest', mode: 'vertical' },
};

export const PLACEMENT_ERR_PX = 2; // бір нүктені қоюдағы болжамды қателік, пиксель

export const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

export function calibration(points, rodLength) {
  const a = points.rodTop, b = points.rodBottom;
  if (!a || !b || !(rodLength > 0)) return null;
  const P = dist(a, b);
  if (P < 1) return null;
  const S = rodLength / P;
  // Рейка бағыты — «тік» бағыттың өлшемі (телефон сәл қисайса да дұрыс есептеу үшін)
  const ux = (a.x - b.x) / P, uy = (a.y - b.y) / P;
  const tiltDeg = Math.abs(Math.atan2(ux, -uy) * 180 / Math.PI);
  return { R: rodLength, P, S, axis: { x: ux, y: uy }, tiltDeg };
}

export function dimPixels(key, points, cal) {
  const d = DIMS[key];
  const a = points[d.a], b = points[d.b];
  if (!a || !b) return null;
  if (d.mode === 'direct' || !cal) return dist(a, b);
  const vx = a.x - b.x, vy = a.y - b.y;
  return Math.abs(vx * cal.axis.x + vy * cal.axis.y);
}

export function computeDims(points, rodLength) {
  const cal = calibration(points, rodLength);
  const out = { cal, dims: {}, px: {}, unc: {} };
  for (const k of Object.keys(DIMS)) {
    const px = dimPixels(k, points, cal);
    out.px[k] = px;
    if (cal && px != null) {
      const v = px * cal.S;
      out.dims[k] = v;
      // Қателікті бағалау: екі нүктенің орны ± δ, рейканың екі нүктесі ± δ
      const d = PLACEMENT_ERR_PX;
      out.unc[k] = cal.S * 2 * d + v * (2 * d / cal.P);
    } else out.dims[k] = null;
  }
  return out;
}

// Өлшеу сызығының экрандағы ұштары (тік өлшемдер рейка осі бойынша сызылады)
export function dimSegment(key, points, cal) {
  const d = DIMS[key];
  const a = points[d.a], b = points[d.b];
  if (!a || !b) return null;
  if (d.mode === 'direct' || !cal) return [a, b];
  const vx = a.x - b.x, vy = a.y - b.y;
  const t = vx * cal.axis.x + vy * cal.axis.y;
  return [a, { x: a.x - t * cal.axis.x, y: a.y - t * cal.axis.y }];
}
