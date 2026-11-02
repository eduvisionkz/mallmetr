// «ЖОБАНЫ ҚОРҒАУ» — ғылыми жобаны таныстыру режимі. Мәтіндерді оқушы өзі өңдей алады.
import { db } from './db.js';
import { getActiveModel, fmt } from './models.js';
import { parse, render } from './expr.js';
import { recordError } from './lab.js';
import { ICONS, esc, num, toast } from './ui.js';
import { schemeSVG } from './scheme.js';

const SECTIONS = [
  ['topic', 'Зерттеу тақырыбы', 'Қой салмағын жанаспай анықтаудың математикалық моделі.'],
  ['problem', 'Зерттеу мәселесі', 'Шаруашылықта қойдың салмағын білу азықтандыру, сату және денсаулығын бақылау үшін маңызды. Алайда мал таразысы әр ауылда бола бермейді, ал жануарды ұстап, таразыға апару оны күйзелтеді және көп уақыт алады.'],
  ['goal', 'Мақсаты', 'Смартфон камерасымен түсірілген сурет бойынша қойдың дене өлшемдерін анықтайтын және солардың негізінде салмағын болжайтын математикалық модель құру, оны MalMetr мобильді қосымшасы ретінде жүзеге асыру.'],
  ['hypothesis', 'Болжамы', 'Егер суреттегі масштабты белгілі ұзындықтағы рейка арқылы анықтап, қойдың шоқтықтағы биіктігін (H), тұрқының ұзындығын (L) және дене тереңдігін (D) өлшесек, онда осы өлшемдер арқылы қойдың салмағын таразысыз жуықтап бағалауға болады.'],
  ['methods', 'Зерттеу әдістері', '• бақылау және өлшеу;\n• фотограмметрия элементтері (масштаб арқылы өлшеу);\n• математикалық модельдеу;\n• салыстыру және қателікті есептеу;\n• бағдарламалау (PWA қосымша).'],
  ['tech', 'Өлшеу технологиясы', null],
  ['model', 'Авторлық математикалық модель', null],
  ['experiments', 'Модельдік тәжірибелер', 'Үш модель салыстырылды: цилиндр моделі, өлшемдер көбейтіндісі моделі және сызықтық модель. Коэффициенттерді өзгерткенде болжамның қалай өзгеретіні «Модель құрастыру» бөлімінде графикпен көрсетіледі.'],
  ['app', 'MalMetr қосымшасы', 'MalMetr — Android мен iPhone-да жұмыс істейтін PWA қосымша. Ол камераны ашып, кадрды бекітеді, рейка арқылы масштабты анықтайды, нүктелер бойынша H, L, D өлшемдерін есептейді, модель бойынша болжамды салмақты шығарады және нәтижелерді құрылғыда сақтайды. Интернетсіз де жұмыс істейді. AI көмекші (COCO-SSD нейрожелісі) камерада қойды тауып, суретте силуэтін бөледі және өлшеу нүктелерін ұсынады; оқушы әр нүктені тексеріп түзетеді, ал AI мен тексерілген өлшемдердің айырмасы зертханада есептеледі.'],
  ['results', 'Нәтижелер', null],
  ['conclusion', 'Қорытынды', 'Смартфон камерасы мен өлшеу рейкасы арқылы қойдың дене өлшемдерін жанаспай анықтауға болады. Салмақты болжайтын модельдің дәлдігін бағалау үшін таразымен өлшенген нақты деректермен салыстыру қажет. Келесі кезеңде деректер санын көбейтіп, модель коэффициенттерін нақтылау және автоматты тану мүмкіндігін зерттеу жоспарлануда.'],
];

export async function renderDefense(view, go) {
  const saved = (await db.getSetting('defenseTexts')) || {};
  let i = Math.min(+(await db.getSetting('defenseSlide', 0)) || 0, SECTIONS.length - 1);
  let editing = false;
  const model = await getActiveModel();
  const recs = await db.getAll('records');

  async function liveHTML(key) {
    if (key === 'tech') return `
      <div style="color:var(--text);margin-bottom:12px">${schemeSVG()}</div>
      <div class="math">
        <div class="row">S = R / P</div>
        <div class="row">X(см) = X(пиксель) · S</div>
      </div>
      <p class="def-text" style="font-size:15px;margin-top:10px">Қойдың қасына ұзындығы белгілі тік рейка қойылады. Суретте рейканың екі ұшы белгіленіп, бір пиксельдің неше сантиметр екені (S) табылады. Содан кейін дене нүктелері арасындағы қашықтықтар сантиметрге айналдырылады.</p>`;
    if (key === 'model') {
      let f = model.formula; try { f = render(parse(model.formula)); } catch {}
      return `
        <div class="formula" style="font-size:18px">M = ${esc(f)}</div>
        <p class="small mono" style="margin-top:8px">${model.coeffs.map(c => `${esc(c.name)} = ${esc(fmt(c.value, 6))}`).join(';  ')}</p>
        <p><span class="badge warn">Модельдік коэффициенттер</span></p>
        ${model.note ? `<p class="def-text" style="font-size:15px">${esc(model.note)}</p>` : ''}`;
    }
    if (key === 'results') {
      const withAct = recs.filter(r => recordError(r));
      const errs = withAct.map(recordError);
      const mae = errs.length ? errs.reduce((s, x) => s + x.e, 0) / errs.length : null;
      const mape = errs.length ? errs.reduce((s, x) => s + x.ep, 0) / errs.length : null;
      return `
        <div class="stat-grid">
          <div class="stat"><div class="k">Өлшенген қой</div><div class="v">${recs.length}</div></div>
          <div class="stat"><div class="k">Таразымен тексерілген</div><div class="v">${withAct.length}</div></div>
          <div class="stat"><div class="k">Орташа E%</div><div class="v">${mape != null ? num(mape) : '—'}<small>%</small></div></div>
        </div>
        <p class="def-text" style="font-size:15px;margin-top:12px">${withAct.length
          ? `Таразымен өлшенген ${withAct.length} қой бойынша болжамның орташа абсолют қателігі ${num(mae)} кг, орташа пайыздық қателігі ${num(mape)}% болды.`
          : 'Нақты (таразымен өлшенген) салмақ әлі енгізілмеген. Сондықтан қазіргі нәтижелер — тек модельдік есептеулер; модельдің дәлдігі туралы қорытынды жасалмайды.'}</p>
        <a class="btn block" href="#/lab" style="margin-top:6px">${ICONS.lab} Зертхана деректерін ашу</a>`;
    }
    return '';
  }

  async function draw() {
    const [key, title, def] = SECTIONS[i];
    const text = saved[key] ?? def;
    view.innerHTML = `
      <div class="card-row" style="justify-content:space-between;margin-bottom:10px">
        <div class="eyebrow">Жобаны қорғау</div>
        <button class="btn sm" id="dEdit">${editing ? ICONS.check + ' Дайын' : ICONS.edit + ' Мәтінді өңдеу'}</button>
      </div>
      <div class="def-nav">${SECTIONS.map((s, k) => `<button class="${k === i ? 'active' : ''}" data-i="${k}" aria-label="${esc(s[1])}">${k + 1}</button>`).join('')}</div>
      <div class="card def-slide view-enter">
        <div class="num-big">${String(i + 1).padStart(2, '0')} / ${SECTIONS.length}</div>
        <h2>${esc(title)}</h2>
        ${text != null ? `<div class="def-text" id="dText" ${editing ? 'contenteditable="true"' : ''}>${esc(text)}</div>` : ''}
        ${await liveHTML(key)}
      </div>
      <div class="btn-row">
        <button class="btn" id="dPrev" ${i === 0 ? 'disabled' : ''}>Алдыңғы</button>
        <button class="btn primary" id="dNext" ${i === SECTIONS.length - 1 ? 'disabled' : ''}>Келесі ${ICONS.arrow}</button>
      </div>
      <button class="btn accent block" id="dScan2" style="margin-top:12px">${ICONS.scan} СКАНЕРДІ КӨРСЕТУ</button>`;
    const go2 = k => { saveText(); i = k; db.setSetting('defenseSlide', i); draw(); };
    view.querySelectorAll('[data-i]').forEach(b => b.onclick = () => go2(+b.dataset.i));
    view.querySelector('#dPrev').onclick = () => go2(i - 1);
    view.querySelector('#dNext').onclick = () => go2(i + 1);
    view.querySelector('#dEdit').onclick = () => { saveText(); editing = !editing; draw(); if (editing) toast('Мәтінді түзетіп, «Дайын» басыңыз'); };
    const scan = () => { saveText(); go('#/scan'); };
    view.querySelector('#dScan2').onclick = scan;
  }

  function saveText() {
    const el = view.querySelector('#dText');
    if (!el || el.getAttribute('contenteditable') !== 'true') return;
    saved[SECTIONS[i][0]] = el.innerText.trim();
    db.setSetting('defenseTexts', saved);
  }

  // Пернетақтадағы көрсеткілермен ауысу (проектор/ноутбук үшін)
  const onKey = e => {
    if (editing || /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' && i < SECTIONS.length - 1) { i++; draw(); }
    if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); }
  };
  document.addEventListener('keydown', onKey);
  await draw();
  return () => { saveText(); document.removeEventListener('keydown', onKey); };
}
