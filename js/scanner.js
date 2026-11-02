// MalMetr Smart Scanner — нақты камера, кадрды бекіту, кадр сапасын (жарық, анықтық) өлшеу
import { ICONS, toast, esc } from './ui.js';
import { normalizeSource, setSessionImage, fileToImage, resetSession } from './session.js';
import { detector } from './ai/detector.js';

let facing = 'environment';

// opts.next — кадр бекітілгеннен кейінгі бет; opts.simple — қарапайым режим (AI автоматты жүктеледі)
export function renderScanner(view, go, opts = {}) {
  const NEXT = opts.next || '#/measure', HOME = opts.home || '#/home', SIMPLE = !!opts.simple;
  document.body.classList.add('immersive');
  view.classList.add('fullbleed');
  view.innerHTML = `
    <div class="scanner" id="scanner">
      <video id="scanVideo" playsinline muted autoplay></video>
      <canvas id="aiBox" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
      <div class="scan-frame" aria-hidden="true">
        <i></i><i></i><i></i><i></i>
        <div class="gridline" style="left:33.3%;top:0;bottom:0;width:1px"></div>
        <div class="gridline" style="left:66.6%;top:0;bottom:0;width:1px"></div>
        <div class="gridline" style="top:50%;left:0;right:0;height:1px"></div>
      </div>
      <div class="scan-top">
        <button class="icon-btn" id="scanClose" aria-label="Жабу">${ICONS.close}</button>
        <div class="scan-hints">
          ${SIMPLE ? `<div>Қойды тура қырынан, толық кадрға түсіріңіз</div>
          <div>100 см рейка қойдың қасында тік тұрсын</div>
          <div>Рейка ашық түсті болсын: қызыл, қызғылт сары, сары немесе көк</div>` : `<div>Қойды толық кадрға орналастырыңыз</div>
          <div>Телефонды жануарға қырынан бағыттаңыз</div>
          <div>Өлшеу рейкасы кадрда көрінуі тиіс</div>`}
        </div>
      </div>
      <div class="scan-bottom">
        <div class="quality" id="quality" aria-live="polite">
          <span id="qMode">${esc(detector.statusLabel())}</span>
          <span id="qLight">Жарық: —</span>
          <span id="qSharp">Анықтық: —</span>
        </div>
        <div class="shutter-row">
          <label class="round-btn" aria-label="Галереядан сурет таңдау">
            ${ICONS.photo}
            <input type="file" accept="image/*" id="scanFile" hidden>
          </label>
          <div>
            <button class="shutter" id="shutter" aria-label="Кадрды бекіту" disabled></button>
            <div class="shutter-label">КАДРДЫ БЕКІТУ</div>
          </div>
          <button class="round-btn" id="flipBtn" aria-label="Камераны ауыстыру">${ICONS.flip}</button>
        </div>
      </div>
      <div class="scan-msg" id="scanMsg" hidden></div>
    </div>`;

  const video = view.querySelector('#scanVideo');
  const shutter = view.querySelector('#shutter');
  const msg = view.querySelector('#scanMsg');
  let stream = null, qTimer = 0, alive = true, aiBusy = false, aiTimer = 0;
  const sample = document.createElement('canvas');

  const stop = () => {
    clearInterval(qTimer); clearTimeout(aiTimer); aiTimer = 0; clearBox();
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
  };

  function showMessage(html, withUpload = true) {
    msg.hidden = false;
    msg.innerHTML = html + (withUpload ? `
      <label class="btn accent scan-main">${ICONS.scan} Телефон камерасымен түсіру
        <input type="file" accept="image/*" capture="environment" hidden data-upload></label>
      <label class="btn scan-alt">${ICONS.photo} Галереядан таңдау
        <input type="file" accept="image/*" hidden data-upload></label>` : '') + `
      <button class="btn ghost scan-ghost" data-retry>Қайта көру</button>
      <button class="btn ghost scan-ghost" data-home>Басты бетке</button>`;
    msg.querySelectorAll('[data-upload]').forEach(i => i.addEventListener('change', onFile));
    msg.querySelector('[data-retry]').onclick = () => { msg.hidden = true; start(); };
    msg.querySelector('[data-home]').onclick = () => go(HOME);
  }

  async function start() {
    stop();
    shutter.disabled = true;
    // Ендірілген беттерде (iframe) тікелей видео әдетте жабық — бірден телефонның өз камерасын ұсынамыз
    let embedded = false; try { embedded = window.self !== window.top; } catch { embedded = true; }
    if (embedded) {
      showMessage(`<h2>Қойды суретке түсіріңіз</h2>
        <p>Қойды тура қырынан, 100 см рейкамен бірге түсіріңіз. Телефонның камерасы ашылады.</p>`);
      msg.querySelector('[data-retry]').hidden = true;
      return;
    }
    if (!window.isSecureContext) {
      showMessage(`<h2>Камера тек қауіпсіз байланыста ашылады</h2>
        <p>Қосымшаны HTTPS арқылы ашыңыз (мысалы, Vercel сілтемесі). Әзірге суретті галереядан жүктей аласыз.</p>`);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showMessage(`<h2>Бұл браузерде тікелей камера қолжетімсіз</h2>
        <p>Телефонның өз камерасымен түсіріп немесе дайын суретті таңдап жалғастыруға болады.</p>`);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (!alive) { stop(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      await new Promise(r => video.readyState >= 2 ? r() : video.addEventListener('loadeddata', r, { once: true }));
      shutter.disabled = false;
      qTimer = setInterval(measureQuality, 450);
      startAI();
      // Бір ғана камера болса — ауыстыру батырмасын жасыру
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const cams = devs.filter(d => d.kind === 'videoinput');
        view.querySelector('#flipBtn').style.visibility = cams.length > 1 ? 'visible' : 'hidden';
      } catch {}
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        showMessage(`<h2>Камераға рұқсат берілмеді</h2>
          <p>Камераны пайдалану үшін рұқсатты қосыңыз:</p>
          <ol>
            <li><b>Android (Chrome):</b> мекенжай жолындағы құлып белгісі → «Рұқсаттар» → «Камера» → «Рұқсат ету».</li>
            <li><b>iPhone (Safari):</b> «Баптаулар» → «Safari» → «Камера» → «Сұрау» немесе «Рұқсат ету». Мекенжай жолындағы «аА» → «Веб-сайт баптаулары» арқылы да болады.</li>
            <li>Содан кейін «Қайта көру» батырмасын басыңыз.</li>
          </ol>`);
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
        showMessage(`<h2>Камера табылмады</h2><p>Бұл құрылғыда камера жоқ немесе ол қолжетімсіз. Суретті галереядан жүктеңіз.</p>`);
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        showMessage(`<h2>Камера бос емес</h2><p>Камераны басқа қосымша пайдаланып тұрған болуы мүмкін. Оны жауып, қайта көріңіз немесе суретті жүктеңіз.</p>`);
      } else {
        showMessage(`<h2>Камераны ашу мүмкін болмады</h2><p>${esc(err && err.message || '')}</p>`);
      }
    }
  }

  // ---- AI: тікелей видеода жануарды табу ----
  const box = view.querySelector('#aiBox');
  function clearBox() { const c = box.getContext('2d'); c.clearRect(0, 0, box.width, box.height); }
  function startAI() {
    const mode = view.querySelector('#qMode');
    if (mode) { mode.textContent = detector.statusLabel(); mode.className = detector.available() ? 'mid' : ''; }
    if (!detector.available() || aiTimer || !stream) return;
    aiTimer = setTimeout(aiTick, 300);
  }
  // Әлсіз телефонда интерфейс қатып қалмауы үшін аралық есептеу уақытына қарай бейімделеді
  async function aiTick() {
    if (!alive || !stream) { aiTimer = 0; return; }
    let dt = 0;
    if (!aiBusy && video.videoWidth && !document.hidden) {
      aiBusy = true;
      const t0 = performance.now();
      try { drawBox(await detector.detectAnimals(video, 4)); } catch (e) { console.warn(e); }
      dt = performance.now() - t0;
      aiBusy = false;
    }
    if (alive && stream) aiTimer = setTimeout(aiTick, Math.max(600, dt * 3));
    else aiTimer = 0;
  }
  function drawBox(dets) {
    const r = box.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    box.width = r.width * dpr; box.height = r.height * dpr;
    const c = box.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, r.width, r.height);
    const mode = view.querySelector('#qMode');
    const best = dets.filter(d => d.cls === 'sheep').sort((a, b) => b.score - a.score)[0] || dets.sort((a, b) => b.score - a.score)[0];
    if (!best) { if (mode) { mode.textContent = 'AI: жануар табылмады'; mode.className = 'mid'; } return; }
    const vw = video.videoWidth, vh = video.videoHeight, k = Math.min(r.width / vw, r.height / vh);
    const ox = (r.width - vw * k) / 2, oy = (r.height - vh * k) / 2;
    const [x, y, w, h] = best.bbox;
    const isSheep = best.cls === 'sheep';
    c.strokeStyle = isSheep ? '#6E7C12' : '#C98A00'; c.lineWidth = 3; c.setLineDash([10, 6]);
    c.strokeRect(ox + x * k, oy + y * k, w * k, h * k);
    const label = `${best.name} · ${Math.round(best.score * 100)}%`;
    c.setLineDash([]); c.font = '700 14px system-ui, sans-serif';
    const tw = c.measureText(label).width + 14;
    c.fillStyle = isSheep ? '#6E7C12' : '#C98A00'; c.fillRect(ox + x * k, Math.max(0, oy + y * k - 26), tw, 24);
    c.fillStyle = '#FFFFFF'; c.fillText(label, ox + x * k + 7, Math.max(0, oy + y * k - 26) + 17);
    if (mode) { mode.textContent = isSheep ? `Қой табылды · ${Math.round(best.score * 100)}%` : `${best.name}? · қой емес сияқты`; mode.className = isSheep ? 'good' : 'mid'; }
  }
  const unsubAI = detector.onChange(() => startAI());
  if (SIMPLE) {
    // Қарапайым режимде AI модель сұраусыз жүктеледі (бір рет, ≈11 МБ), прогресі чипте көрінеді
    if (!detector.available()) {
      const mode = view.querySelector('#qMode');
      if (mode) { mode.textContent = 'AI модель жүктелуде…'; mode.className = 'mid'; }
      detector.enable(f => { const m = view.querySelector('#qMode'); if (m && detector.state === 'loading') m.textContent = `AI модель жүктелуде: ${Math.round(f * 100)}% (бір рет)`; })
        .then(ok => { const m = view.querySelector('#qMode'); if (!ok && m) { m.textContent = 'AI жүктелмеді — интернетті тексеріңіз'; m.className = 'bad'; } });
    }
  } else detector.autoload();

  // Кадр сапасы: орташа жарықтық және Лаплас дисперсиясы (анықтық өлшемі)
  function measureQuality() {
    if (!video.videoWidth) return;
    const w = 160, h = Math.round(160 * video.videoHeight / video.videoWidth);
    sample.width = w; sample.height = h;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; g[j] = y; sum += y; }
    const mean = sum / g.length;
    let s1 = 0, s2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      s1 += lap; s2 += lap * lap; n++;
    }
    const varLap = s2 / n - (s1 / n) ** 2;
    const L = view.querySelector('#qLight'), S = view.querySelector('#qSharp');
    if (!L) return;
    const light = mean < 55 ? ['bad', 'аз'] : mean > 215 ? ['bad', 'тым көп'] : mean < 80 ? ['mid', 'орташа'] : ['good', 'жеткілікті'];
    const sharp = varLap < 40 ? ['bad', 'бұлыңғыр'] : varLap < 110 ? ['mid', 'орташа'] : ['good', 'жақсы'];
    L.className = light[0]; L.textContent = 'Жарық: ' + light[1];
    S.className = sharp[0]; S.textContent = 'Анықтық: ' + sharp[1];
  }

  async function capture() {
    if (!video.videoWidth) return;
    shutter.disabled = true;
    try {
      const { blob, width, height } = await normalizeSource(video, video.videoWidth, video.videoHeight);
      stop();
      resetSession();
      await setSessionImage(blob, width, height, 'camera');
      if (navigator.vibrate) navigator.vibrate(30);
      go(NEXT);
    } catch (e) {
      toast(e.message || 'Кадрды сақтау мүмкін болмады');
      shutter.disabled = false;
    }
  }

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const { blob, width, height } = await fileToImage(f);
      stop();
      resetSession();
      await setSessionImage(blob, width, height, 'file');
      go(NEXT);
    } catch (err) { toast(err.message || 'Суретті ашу мүмкін болмады'); }
  }

  shutter.onclick = capture;
  view.querySelector('#scanFile').addEventListener('change', onFile);
  view.querySelector('#flipBtn').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); };
  view.querySelector('#scanClose').onclick = () => go(HOME);
  const onVis = () => { if (document.hidden) stop(); else if (alive && !stream && msg.hidden) start(); };
  document.addEventListener('visibilitychange', onVis);

  start();

  return () => {
    alive = false;
    unsubAI();
    stop();
    document.removeEventListener('visibilitychange', onVis);
    document.body.classList.remove('immersive');
    view.classList.remove('fullbleed');
  };
}

// Камерасыз: галереядан сурет таңдау
export function pickPhoto(go) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const { blob, width, height } = await fileToImage(f);
      resetSession();
      await setSessionImage(blob, width, height, 'file');
      go('#/measure');
    } catch (e) { toast(e.message || 'Суретті ашу мүмкін болмады'); }
  };
  inp.click();
}
