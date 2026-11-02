// Жеңіл canvas диаграммалары (сыртқы кітапханасыз, офлайн жұмыс істейді)
export const SERIES_COLORS = ['#1E6FD9', '#13B5A5', '#E0832A', '#C25BD6', '#E5484D', '#2EA86B'];

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function setup(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  return { ctx, w: r.width, h: r.height };
}

function niceTicks(min, max, n = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
}
const lab = v => String(+v.toPrecision(4)).replace('.', ',').replace('-', '−');

function axes(ctx, w, h, xr, yr, xLabel, yLabel) {
  const pad = { l: 46, r: 12, t: 12, b: 34 };
  const X = v => pad.l + (v - xr.lo) / (xr.hi - xr.lo) * (w - pad.l - pad.r);
  const Y = v => h - pad.b - (v - yr.lo) / (yr.hi - yr.lo) * (h - pad.t - pad.b);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--line'); ctx.lineWidth = 1;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of yr.ticks) { const y = Y(t); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(lab(t), pad.l - 6, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of xr.ticks) { const x = X(t); ctx.fillText(lab(t), x, h - pad.b + 6); }
  ctx.fillStyle = css('--muted');
  if (xLabel) { ctx.textAlign = 'right'; ctx.fillText(xLabel, w - pad.r, h - 13); }
  if (yLabel) { ctx.save(); ctx.translate(11, pad.t); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(yLabel, 2, -10 + 10); ctx.restore(); }
  return { X, Y, pad };
}

// series: [{ name, color, points: [[x,y],...] }]
export function lineChart(canvas, series, { xLabel = '', yLabel = '', marker = null } = {}) {
  const { ctx, w, h } = setup(canvas);
  const pts = series.flatMap(s => s.points).filter(p => Number.isFinite(p[1]));
  if (!pts.length) return;
  const xr = niceTicks(Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0])), 5);
  const yr = niceTicks(Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1])), 4);
  const { X, Y } = axes(ctx, w, h, xr, yr, xLabel, yLabel);
  if (marker != null) {
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = css('--muted');
    ctx.beginPath(); ctx.moveTo(X(marker), Y(yr.lo)); ctx.lineTo(X(marker), Y(yr.hi)); ctx.stroke(); ctx.restore();
  }
  series.forEach((s, i) => {
    ctx.strokeStyle = s.color || SERIES_COLORS[i % SERIES_COLORS.length];
    ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    for (const [x, y] of s.points) {
      if (!Number.isFinite(y)) { started = false; continue; }
      if (!started) { ctx.moveTo(X(x), Y(y)); started = true; } else ctx.lineTo(X(x), Y(y));
    }
    ctx.stroke();
  });
}

// Болжам мен нақты салмақты салыстыру (y = x сызығымен)
export function scatterChart(canvas, series, { xLabel = '', yLabel = '', diagonal = true } = {}) {
  const { ctx, w, h } = setup(canvas);
  const pts = series.flatMap(s => s.points);
  if (!pts.length) return;
  const all = pts.flatMap(p => diagonal ? [p[0], p[1]] : [p[0]]);
  const xr = niceTicks(Math.min(...all), Math.max(...all), 5);
  const yr = diagonal ? xr : niceTicks(Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1])), 4);
  const { X, Y } = axes(ctx, w, h, xr, yr, xLabel, yLabel);
  if (diagonal) {
    ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = css('--muted');
    ctx.beginPath(); ctx.moveTo(X(xr.lo), Y(xr.lo)); ctx.lineTo(X(xr.hi), Y(xr.hi)); ctx.stroke(); ctx.restore();
  }
  series.forEach((s, i) => {
    ctx.fillStyle = s.color || SERIES_COLORS[i % SERIES_COLORS.length];
    for (const [x, y] of s.points) { ctx.beginPath(); ctx.arc(X(x), Y(y), 4.5, 0, 7); ctx.fill(); }
  });
}

export function barChart(canvas, items, { yLabel = '' } = {}) {
  const { ctx, w, h } = setup(canvas);
  if (!items.length) return;
  const max = Math.max(...items.map(i => i.value), 0);
  const yr = niceTicks(0, max || 1, 4);
  const pad = { l: 46, r: 12, t: 12, b: 34 };
  const Y = v => h - pad.b - (v - yr.lo) / (yr.hi - yr.lo) * (h - pad.t - pad.b);
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--line');
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of yr.ticks) { const y = Y(t); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(lab(t), pad.l - 6, y); }
  if (yLabel) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(yLabel, 4, 0); }
  const bw = (w - pad.l - pad.r) / items.length;
  items.forEach((it, i) => {
    const x = pad.l + i * bw + bw * 0.18, bh = Y(0) - Y(it.value);
    ctx.fillStyle = it.color || SERIES_COLORS[0];
    ctx.fillRect(x, Y(it.value), bw * 0.64, bh);
    ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(it.label.length > 10 ? it.label.slice(0, 9) + '…' : it.label, x + bw * 0.32, h - pad.b + 6);
  });
}
