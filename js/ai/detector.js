// AI көмекші: COCO-SSD (TensorFlow.js) нейрожелісі жануарды табады,
// содан кейін segment.js силуэтті бөліп, өлшеу нүктелерін ҰСЫНАДЫ.
//
// Маңызды:
//  • Модель жануарды тауып, оның сенімділігін (score) береді — бұл нақты шама.
//  • Анатомиялық нүктелер силуэт бойынша эвристикамен есептеледі; олардың дәлдігі
//    нақты қойлармен тексерілмеген. Сондықтан әр нүктені пайдаланушы тексереді.
//  • Кездейсоқ координаталар ешқашан қайтарылмайды: табылмаса — null.
//  • Модель файлдары (≈9 МБ) бір рет жүктеледі, содан кейін офлайн жұмыс істейді.
import { db } from '../db.js';
import { segmentAnimal, keypointsFromMask, detectRod } from './segment.js';
import { detectRuler, rodExclusion } from './ruler.js';

export const MODEL_NAME = 'COCO-SSD MobileNet v2 (TensorFlow.js, float16)';
const MODEL_URL = 'models/coco-ssd/model.json';
const SCRIPTS = ['vendor/tf.min.js', 'vendor/coco-ssd.js'];
const APPROX_BYTES = 11_300_000;
export const ANIMALS = { sheep: 'Қой', cow: 'Сиыр', horse: 'Жылқы', dog: 'Ит', cat: 'Мысық', bear: 'Аю', elephant: 'Піл', zebra: 'Зебра', giraffe: 'Керік' };
export const MIN_SCORE = 0.3;
const OTHER_NAMES = { person: 'адам', car: 'көлік', truck: 'жүк көлігі', bicycle: 'велосипед', motorcycle: 'мотоцикл', bench: 'орындық', chair: 'орындық', backpack: 'сөмке' };
const WORK_SIDE = 640;

let model = null;
let loading = null;
let state = 'off'; // off | loading | ready | error
let lastError = '';
const listeners = new Set();
const emit = () => listeners.forEach(f => { try { f(state); } catch {} });

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.dataset.src = src;
    s.onload = res; s.onerror = () => rej(new Error('Файл жүктелмеді: ' + src));
    document.head.appendChild(s);
  });
}

// Файлдарды алдын ала жүктеу (прогресс көрсету үшін); service worker оларды кэшке сақтайды
async function prefetch(onProgress) {
  let done = 0;
  const tick = n => { done += n; onProgress && onProgress(Math.min(0.99, done / APPROX_BYTES)); };
  const get = async url => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ': ' + r.status);
    if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); tick(b.byteLength); return b; }
    const reader = r.body.getReader(); const parts = [];
    for (;;) { const { done: d, value } = await reader.read(); if (d) break; parts.push(value); tick(value.byteLength); }
    return new Blob(parts).arrayBuffer();
  };
  for (const s of SCRIPTS) await get(s);
  const mj = JSON.parse(new TextDecoder().decode(await get(MODEL_URL)));
  for (const g of mj.weightsManifest) for (const p of g.paths) await get(MODEL_URL.replace('model.json', p));
}

export const detector = {
  get state() { return state; },
  get error() { return lastError; },
  available() { return state === 'ready'; },
  statusLabel() { return state === 'ready' ? 'AI көмекші · тексерілмеген' : 'Қолмен өлшеу режимі'; },
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },

  async isEnabled() { return !!(await db.getSetting('aiEnabled', false)); },
  async isCached() {
    try { return !!(window.caches && await caches.match(new URL(MODEL_URL, location.href).href)); } catch { return false; }
  },

  // Модельді жүктеу (алғашқы рет интернет керек)
  async enable(onProgress) {
    if (model) return true;
    if (loading) return loading;
    state = 'loading'; lastError = ''; emit();
    loading = (async () => {
      try {
        await prefetch(onProgress);
        for (const s of SCRIPTS) await loadScript(s);
        const tf = window.tf;
        try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
        await tf.ready();
        model = await window.cocoSsd.load({ modelUrl: MODEL_URL });
        // жылыту: бірінші есептеу баяу болады
        const c = document.createElement('canvas'); c.width = c.height = 64;
        await model.detect(c, 1, 0.9);
        await db.setSetting('aiEnabled', true);
        state = 'ready'; onProgress && onProgress(1); emit();
        return true;
      } catch (e) {
        console.error(e);
        lastError = navigator.onLine === false ? 'Интернет жоқ. Модельді алғаш жүктеу үшін интернетке қосылыңыз.' : (e.message || String(e));
        state = 'error'; model = null; emit();
        return false;
      } finally { loading = null; }
    })();
    return loading;
  },

  async disable() {
    await db.setSetting('aiEnabled', false);
    model = null; state = 'off'; emit();
  },

  // Бұрын қосылған болса, фонда жүктеу
  async autoload() {
    if (model || loading) return;
    if (await this.isEnabled()) this.enable();
  },

  // Видео немесе сурет бойынша жануарларды табу
  async detectAnimals(source, maxBoxes = 6) {
    if (!model) return [];
    const res = await model.detect(source, maxBoxes, MIN_SCORE);
    return res.filter(d => d.class in ANIMALS).map(d => ({ cls: d.class, name: ANIMALS[d.class], score: d.score, bbox: d.bbox }));
  },

  // Барлық табылған нысандар (адам, жануар, т.б.) — қойдың жабылмағанын және жалғыз екенін тексеру үшін
  async detectAll(source, maxBoxes = 20) {
    if (!model) return [];
    const res = await model.detect(source, maxBoxes, MIN_SCORE);
    return res.map(d => ({ cls: d.class, name: ANIMALS[d.class] || OTHER_NAMES[d.class] || 'басқа зат', score: d.score, bbox: d.bbox, animal: d.class in ANIMALS }));
  },

  // Толық ұсыныс: жануар → рейка → силуэт → нүктелер. Координаталар — бастапқы сурет пикселдерінде.
  async suggest(img, width, height, { headSide = 'auto', rodColor = 'redorange', rodLength = 100 } = {}) {
    if (!model) throw new Error('AI модель жүктелмеген');
    const k = Math.min(1, WORK_SIDE / Math.max(width, height));
    const w = Math.round(width * k), h = Math.round(height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const dets = await this.detectAnimals(c, 8);
    const sheep = dets.filter(d => d.cls === 'sheep').sort((a, b) => b.score - a.score)[0];
    const animal = sheep || dets.sort((a, b) => b.score - a.score)[0] || null;
    const data = ctx.getImageData(0, 0, w, h);

    // Алдымен ақ-қара бөлікті сызғыш, табылмаса — таңдалған түсті рейка
    const rod = detectRuler(data, rodLength) || detectRod(data, rodColor, animal ? animal.bbox : null);
    const out = { model: MODEL_NAME, animal: null, rod: null, segOk: false, warnings: [], points: {}, headLeft: null, autoLeft: null, overlay: null, _seg: null, _k: k };
    if (rod) {
      out.rod = { aspect: rod.aspect, kind: rod.kind || 'color' };
      out.points.rodTop = { x: rod.top.x / k, y: rod.top.y / k };
      out.points.rodBottom = { x: rod.bottom.x / k, y: rod.bottom.y / k };
    }
    if (!animal) return out;
    out.animal = { cls: animal.cls, name: animal.name, score: animal.score, bbox: animal.bbox.map(v => v / k) };

    const excl = rod ? rodExclusion(rod, w, h) : null;
    const seg = segmentAnimal(data, animal.bbox, excl);
    out._seg = seg;
    out.segOk = seg.ok;
    out.overlay = maskOverlay(seg, k);
    Object.assign(out, this.pointsFromSeg(seg, k, headSide));
    if (out.bodyPoints) Object.assign(out.points, out.bodyPoints);
    delete out.bodyPoints;
    return out;
  },

  // Бас бағыты өзгергенде нүктелерді қайта есептеу (силуэт қайта бөлінбейді)
  pointsFromSeg(seg, k, headSide) {
    const kp = keypointsFromMask(seg, headSide);
    if (!kp) return { bodyPoints: null, headLeft: null, autoLeft: null, warnings: ['shape'] };
    const bodyPoints = {};
    for (const [key, p] of Object.entries(kp.points)) bodyPoints[key] = { x: p.x / k, y: p.y / k };
    return { bodyPoints, headLeft: kp.headLeft, autoLeft: kp.autoLeft, warnings: kp.warnings };
  },
};

function maskOverlay(seg, k) {
  const c = document.createElement('canvas');
  c.width = seg.w; c.height = seg.h;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(seg.w, seg.h);
  for (let i = 0; i < seg.mask.length; i++) if (seg.mask[i]) { const j = i * 4; id.data[j] = 43; id.data[j + 1] = 211; id.data[j + 2] = 193; id.data[j + 3] = 255; }
  ctx.putImageData(id, 0, 0);
  return { canvas: c, x: seg.x0 / k, y: seg.y0 / k, w: seg.w / k, h: seg.h / k };
}
