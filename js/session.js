// Ағымдағы өлшеу сессиясы және сурет өңдеу көмекшілері
export const MAX_SIDE = 2560; // жадты үнемдеу үшін ең үлкен жақ (пропорция сақталады)

export const session = {
  blob: null, url: null, width: 0, height: 0, source: null, // 'camera' | 'file'
  points: {}, rodLength: 100, editingId: null, animalId: '', actual: null, note: '',
  stage: 'preview',
};

export function resetSession() {
  if (session.url) URL.revokeObjectURL(session.url);
  Object.assign(session, { blob: null, url: null, width: 0, height: 0, source: null, points: {}, editingId: null, animalId: '', actual: null, note: '', modelId: null, ai: null, showMask: true, stage: 'preview', rulerAuto: false });
}

export async function setSessionImage(blob, width, height, source) {
  if (session.url) URL.revokeObjectURL(session.url);
  session.blob = blob;
  session.url = URL.createObjectURL(blob);
  session.width = width; session.height = height;
  session.source = source;
  session.points = {};
  session.ai = null;
  session.rulerAuto = false;
  session.stage = 'preview';
}

export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Суретті ашу мүмкін болмады'));
    img.src = url;
  });
}

function canvasToBlob(canvas, q = 0.92) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Суретті сақтау мүмкін болмады')), 'image/jpeg', q));
}

// Кез келген сурет көзін JPEG-ке айналдыру; EXIF бағыты браузерде қолданылады; пропорция өзгермейді
export async function normalizeSource(src, sw, sh) {
  let k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  const blob = await canvasToBlob(c);
  return { blob, width: w, height: h };
}

export async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return await normalizeSource(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

// Суретті 90°-қа бұру (сағат тілімен)
export async function rotate90(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = img.naturalHeight; c.height = img.naturalWidth;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0);
    return { blob: await canvasToBlob(c), width: c.width, height: c.height };
  } finally { URL.revokeObjectURL(url); }
}

export async function makeThumb(blob, side = 240) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const k = side / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return canvasToBlob(c, 0.8);
  } finally { URL.revokeObjectURL(url); }
}
