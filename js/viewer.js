// Фотосуретті үлкейту/жылжыту және өлшеу нүктелерін қою (саусақпен де, тінтуірмен де)
import { POINT, DIMS, dimSegment } from './geometry.js';
import { num } from './ui.js';

const HIT_R = 26;      // нүктені ұстау радиусы (CSS px)
const TAP_SLOP = 8;    // түрту мен жылжытуды ажырату шегі

export class Viewer {
  constructor(canvas, opts) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = opts.image;
    this.iw = opts.width; this.ih = opts.height;
    this.points = opts.points || {};
    this.keys = opts.keys || [];
    this.active = opts.active || null;
    this.getOverlay = opts.getOverlay || (() => ({}));
    this.onChange = opts.onChange || (() => {});
    this.onPlaced = opts.onPlaced || (() => {});
    this.scale = 1; this.tx = 0; this.ty = 0;
    this.undoStack = [];
    this.ptrs = new Map();
    this.mode = null;
    this.loupe = null;
    this._raf = 0;

    this._down = this.down.bind(this);
    this._move = this.move.bind(this);
    this._up = this.up.bind(this);
    this._wheel = this.wheel.bind(this);
    canvas.addEventListener('pointerdown', this._down);
    canvas.addEventListener('pointermove', this._move);
    canvas.addEventListener('pointerup', this._up);
    canvas.addEventListener('pointercancel', this._up);
    canvas.addEventListener('wheel', this._wheel, { passive: false });
    this.ro = new ResizeObserver(() => { const first = !this.cw; this.resize(); if (first) this.fit(); else this.request(); });
    this.ro.observe(canvas);
  }

  destroy() {
    this.ro.disconnect();
    const c = this.c;
    c.removeEventListener('pointerdown', this._down);
    c.removeEventListener('pointermove', this._move);
    c.removeEventListener('pointerup', this._up);
    c.removeEventListener('pointercancel', this._up);
    c.removeEventListener('wheel', this._wheel);
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cw = r.width; this.ch = r.height;
    this.c.width = Math.round(r.width * this.dpr);
    this.c.height = Math.round(r.height * this.dpr);
  }

  fit() {
    if (!this.cw) return;
    const s = Math.min(this.cw / this.iw, this.ch / this.ih);
    this.scale = s;
    this.minScale = s * 0.5;
    this.tx = (this.cw - this.iw * s) / 2;
    this.ty = (this.ch - this.ih * s) / 2;
    this.request();
  }

  zoomBy(f, cx = this.cw / 2, cy = this.ch / 2) {
    const ns = Math.max(this.minScale || 0.05, Math.min(this.scale * f, 40));
    const k = ns / this.scale;
    this.tx = cx - (cx - this.tx) * k;
    this.ty = cy - (cy - this.ty) * k;
    this.scale = ns;
    this.request();
  }

  toImg(sx, sy) { return { x: (sx - this.tx) / this.scale, y: (sy - this.ty) / this.scale }; }
  toScr(p) { return { x: p.x * this.scale + this.tx, y: p.y * this.scale + this.ty }; }
  local(e) { const r = this.c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  setActive(key) { this.active = key; this.request(); }
  setKeys(keys) { this.keys = keys; this.request(); }

  snapshot() { this.undoStack.push(JSON.stringify(this.points)); if (this.undoStack.length > 60) this.undoStack.shift(); }
  undo() {
    if (!this.undoStack.length) return false;
    const prev = JSON.parse(this.undoStack.pop());
    for (const k of Object.keys(this.points)) delete this.points[k];
    Object.assign(this.points, prev);
    this.onChange(this.points); this.request();
    return true;
  }

  hit(s) {
    let best = null, bd = HIT_R;
    for (const k of this.keys) {
      const p = this.points[k]; if (!p) continue;
      const q = this.toScr(p);
      const d = Math.hypot(q.x - s.x, q.y - s.y);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  clampImg(p) { return { x: Math.max(0, Math.min(this.iw, p.x)), y: Math.max(0, Math.min(this.ih, p.y)) }; }

  down(e) {
    e.preventDefault();
    this.c.setPointerCapture(e.pointerId);
    const s = this.local(e);
    this.ptrs.set(e.pointerId, s);
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.mode = { t: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.loupe = null;
      return;
    }
    if (this.ptrs.size > 2) return;
    const key = this.hit(s);
    // Нүкте жанында басылса: жылжытса — сол нүкте сүйреледі; жылжытпай жіберсе — белсенді нүкте қойылады
    // (белсенді нүкте әлі қойылмаған болса) немесе басылған нүкте таңдалады.
    this.mode = { t: 'tap', sx: s.x, sy: s.y, tx: this.tx, ty: this.ty, moved: false, hitKey: key };
    this.request();
  }

  move(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    const s = this.local(e);
    this.ptrs.set(e.pointerId, s);
    const m = this.mode; if (!m) return;
    if (m.t === 'pinch' && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.tx += mx - m.mx; this.ty += my - m.my;
      if (m.d > 0) this.zoomBy(d / m.d, mx, my);
      m.d = d; m.mx = mx; m.my = my;
      this.request();
    } else if (m.t === 'drag') {
      m.moved = true;
      this.points[m.key] = this.clampImg(this.toImg(s.x + m.ox, s.y + m.oy));
      this.onChange(this.points);
      this.request();
    } else if (m.t === 'tap') {
      const dx = s.x - m.sx, dy = s.y - m.sy;
      if (!m.moved && Math.hypot(dx, dy) > TAP_SLOP) {
        m.moved = true;
        if (m.hitKey) {
          // нүктені сүйреуге көшу
          const key = m.hitKey;
          this.snapshot();
          const q = this.toScr(this.points[key]);
          this.mode = { t: 'drag', key, ox: q.x - m.sx, oy: q.y - m.sy, moved: true };
          if (this.active !== key) { this.active = key; this.onPlaced(key, false); }
          this.loupe = { key };
          return this.move(e);
        }
      }
      if (m.moved) { this.tx = m.tx + dx; this.ty = m.ty + dy; this.request(); }
    }
  }

  up(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.delete(e.pointerId);
    const m = this.mode;
    if (m && m.t === 'tap' && !m.moved && this.ptrs.size === 0 && e.type === 'pointerup') {
      if (m.hitKey && (!this.active || this.points[this.active] || m.hitKey === this.active)) {
        // бар нүктені таңдау
        this.active = m.hitKey; this.onPlaced(m.hitKey, false);
      } else if (this.active && this.keys.includes(this.active)) {
        this.snapshot();
        const s = this.local(e);
        const key = this.active;
        this.points[key] = this.clampImg(this.toImg(s.x, s.y));
        this.onChange(this.points);
        this.onPlaced(key, true);
      }
    }
    if (this.ptrs.size === 0) { this.mode = null; this.loupe = null; }
    else if (this.ptrs.size === 1 && m && m.t === 'pinch') {
      const s = [...this.ptrs.values()][0];
      this.mode = { t: 'tap', sx: s.x, sy: s.y, tx: this.tx, ty: this.ty, moved: true };
    }
    this.request();
  }

  wheel(e) {
    e.preventDefault();
    const s = this.local(e);
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), s.x, s.y);
  }

  request() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
  }

  draw() {
    const { ctx, dpr } = this;
    if (!this.cw) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.c.width, this.c.height);
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.tx, dpr * this.ty);
    ctx.imageSmoothingEnabled = this.scale < 3;
    ctx.drawImage(this.img, 0, 0, this.iw, this.ih);
    const ov = this.getOverlay();
    // AI силуэті мен табылған жануар шекарасы
    if (ov.mask) {
      ctx.save(); ctx.globalAlpha = 0.28; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(ov.mask.canvas, ov.mask.x, ov.mask.y, ov.mask.w, ov.mask.h);
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ov.bbox) {
      const [bx, by, bw, bh] = ov.bbox, a = this.toScr({ x: bx, y: by }), b = this.toScr({ x: bx + bw, y: by + bh });
      ctx.save(); ctx.setLineDash([7, 5]); ctx.strokeStyle = '#6E7C12'; ctx.lineWidth = 2;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.restore();
      if (ov.bboxLabel) this.tag(a.x - 10, a.y + 2, ov.bboxLabel, '#8A9A22');
    }

    const cal = ov.cal;
    // Рейка
    if (this.points.rodTop && this.points.rodBottom && (this.keys.includes('rodTop') || ov.showRod)) {
      const a = this.toScr(this.points.rodTop), b = this.toScr(this.points.rodBottom);
      this.line(a, b, '#F2A33A', 4, false, true);
      if (cal) this.tag((a.x + b.x) / 2, (a.y + b.y) / 2, `R = ${num(cal.R, 0)} см`, '#F2A33A');
    }
    // Дене өлшемдері
    for (const k of ov.dims || []) {
      const seg = dimSegment(k, this.points, cal);
      if (!seg) continue;
      const a = this.toScr(seg[0]), b = this.toScr(seg[1]);
      const col = POINT[DIMS[k].a].color;
      if (DIMS[k].mode === 'vertical' && cal) {
        // көмекші пунктир: екінші нүктеден өлшеу сызығына дейін
        const p2 = this.toScr(this.points[DIMS[k].b]);
        this.line(p2, b, col, 1.5, true);
      }
      this.line(a, b, col, 3.5, false, true);
      const v = ov.values && ov.values[k];
      // L белгісін сызықтың алдыңғы ширегіне, жоғарырақ қоямыз — D белгісімен қабаттаспауы үшін
      const f = k === 'L' ? 0.22 : 0.5, dy = k === 'L' ? -26 : 0;
      this.tag(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f + dy, v != null ? `${k} = ${num(v)} см` : k, col);
    }
    // Нүктелер
    for (const k of this.keys) {
      const p = this.points[k]; if (!p) continue;
      this.dot(this.toScr(p), POINT[k], k === this.active, ov.aiKeys && ov.aiKeys.includes(k));
    }
    if (this.loupe && this.points[this.loupe.key]) this.drawLoupe(this.loupe.key);
  }

  line(a, b, color, w, dashed = false, ticks = false) {
    const { ctx } = this;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = w + 3;
    if (dashed) ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (ticks) {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / L * 9, ny = (b.x - a.x) / L * 9;
      ctx.setLineDash([]); ctx.lineWidth = 3;
      for (const p of [a, b]) { ctx.beginPath(); ctx.moveTo(p.x - nx, p.y - ny); ctx.lineTo(p.x + nx, p.y + ny); ctx.stroke(); }
    }
    ctx.restore();
  }

  tag(x, y, text, color) {
    const { ctx } = this;
    ctx.save();
    ctx.font = '700 13px system-ui, -apple-system, Roboto, sans-serif';
    const w = ctx.measureText(text).width + 14;
    let px = x + 10, py = y - 12;
    px = Math.min(Math.max(4, px), this.cw - w - 4);
    py = Math.min(Math.max(4, py), this.ch - 26);
    ctx.fillStyle = 'rgba(6,16,30,.85)';
    roundRect(ctx, px, py, w, 24, 8); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(text, px + 7, py + 12.5);
    ctx.restore();
  }

  dot(s, def, active, ai = false) {
    const { ctx } = this;
    ctx.save();
    if (ai) { ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, 7); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
    if (active) { ctx.beginPath(); ctx.arc(s.x, s.y, 17, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, 7);
    ctx.fillStyle = def.color; ctx.fill();
    ctx.strokeStyle = '#06101E'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(s.x - 4, s.y); ctx.lineTo(s.x + 4, s.y); ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x, s.y + 4); ctx.stroke();
    ctx.restore();
    if (active || this.keys.length <= 2) this.tag(s.x + 6, s.y - 2, def.short, def.color);
  }

  // Саусақ астындағы жерді үлкейтіп көрсететін «лупа»
  drawLoupe(key) {
    const { ctx } = this;
    const p = this.points[key];
    const s = this.toScr(p);
    const R = 62, Z = 3;
    const cx = s.x < this.cw / 2 ? this.cw - R - 58 : R + 12; // оң жақтағы құралдарды жаппау үшін
    const cy = R + 12 + (this.ch > 400 ? 40 : 0);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.closePath();
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.clip();
    const sc = this.scale * Z;
    ctx.imageSmoothingEnabled = sc < 3;
    ctx.drawImage(this.img, cx - p.x * sc, cy - p.y * sc, this.iw * sc, this.ih * sc);
    ctx.strokeStyle = POINT[key].color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 6, cy); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 6); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
