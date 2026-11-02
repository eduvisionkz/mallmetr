// Оқушының авторлық моделі: M = k · L · D²
// Деректер: «MalMetr: мал салмағының математикалық моделі» жұмысы, 3-кесте (15 қой, Еділбай тұқымы).
// Алғашқы 10 қой — коэффициентті табуға, қалған 5 қой — тәуелсіз тексеруге.

// [№, L (см), D (см), нақты салмақ (кг)]
export const SHEEP = [
  [1, 69, 28, 48.5], [2, 66, 25, 36], [3, 59, 29, 42.6], [4, 67, 26, 39], [5, 68, 27, 43.5],
  [6, 66, 28, 44.6], [7, 69, 30, 54], [8, 68, 29, 52], [9, 67, 25, 35], [10, 60, 28, 41],
  [11, 67, 27, 42], [12, 59, 25, 32], [13, 63, 28, 43], [14, 65, 29, 48], [15, 66, 30, 53],
];
export const TRAIN = SHEEP.slice(0, 10);
export const TEST = SHEEP.slice(10);

// Коэффициент кестеден бағдарлама арқылы есептеледі (қолмен жазылған сан емес)
export const SUM_M = TRAIN.reduce((s, r) => s + r[3], 0);              // 436,2 кг
export const SUM_I = TRAIN.reduce((s, r) => s + r[1] * r[2] * r[2], 0); // 499 776 см³
export const K = SUM_M / SUM_I;                                         // ≈ 0,00087279101037
// Баламалы цилиндрлік жазу: M = c · 3,14 · D² · L / 4000  →  c = 4000·k / 3,14 ≈ 1,111835
export const C = (4000 * K) / 3.14;

export const MODEL_CAPTION = 'Еділбай тұқымды қойлар бойынша жасалған зерттеу моделі';

// Зерттелген қойлардың өлшем ауқымы
export const RANGE = { L: [59, 69], D: [25, 30] };

export function predictMass(L, D) {
  if (!(Number.isFinite(L) && Number.isFinite(D) && L > 0 && D > 0)) return null;
  return K * L * D * D;
}

// Мәндер мүлде мүмкін емес пе (енгізу қатесі)
export function implausible(L, D) {
  return !(L >= 20 && L <= 200 && D >= 8 && D <= 100);
}

// Мәндер зерттеу ауқымынан едәуір тыс па (болжам сенімсіздеу)
export function outsideStudy(L, D, margin = 0.2) {
  const out = (v, [a, b]) => v < a * (1 - margin) || v > b * (1 + margin);
  return out(L, RANGE.L) || out(D, RANGE.D);
}
