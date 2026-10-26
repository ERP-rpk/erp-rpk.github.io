// Расчёт полиграфии (типография на ризографе): бланки и журналы/книги.
// Перенесено из утверждённого прототипа prototype/polygraphy.html и таблицы «PriceList 2», лист «Типография (расчёт)».
// Чистые функции без обращения к базе: цены и нормы приходят из настроек (ключи poly_*).

const fmtN = (n, d = 0) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d });

// Цены и нормы. temp — временная, уточнить у владельца; в настройках помечается «временная».
export const POLY_SETTINGS = [
  ['Ризограф', [
    ['launchPrice', 10, 'Запуск ризографа, ₽ (один раз)'],
    ['masterPrepPrice', 15, 'Подготовка мастера: оттиск 10 + раскатка 5, ₽'],
    ['masterPrepCost', 2, 'Подготовка мастера — себестоимость, ₽'],
    ['filmPrice', 129, 'Мастер-плёнка А3 — цена, ₽'],
    ['filmCost', 33, 'Мастер-плёнка А3 — себестоимость, ₽'],
    ['masterMax', 3000, 'Листов А3 на одном мастере'],
    ['inkPrice', 0.952, 'Краска на 1 оттиск А3 — цена, ₽'],
    ['inkCost', 0.28, 'Краска на 1 оттиск А3 — себестоимость, ₽'],
    ['priladMin', 5, 'Приладка — не меньше, листов А3'],
    ['priladPct', 1.5, 'Приладка на больших тиражах, % от листов'],
  ]],
  ['Бумага (за лист А3)', [
    ['paperNewsPrice', 1.00, 'Газетная 48,8 г — цена, ₽'], ['paperNewsCost', 0.50, 'Газетная 48,8 г — себестоимость, ₽'], ['paperNewsCut', 450, 'Газетная 48,8 г — листов в пачке под нож'],
    ['paperOffPrice', 2.51, 'Офсетная 65 г — цена, ₽'], ['paperOffCost', 1.22, 'Офсетная 65 г — себестоимость, ₽'], ['paperOffCut', 400, 'Офсетная 65 г — листов в пачке под нож'],
    ['paperVatPrice', 10.80, 'Ватман 180 г — цена, ₽'], ['paperVatCost', 4.50, 'Ватман 180 г — себестоимость, ₽'], ['paperVatCut', 150, 'Ватман 180 г — листов в пачке под нож'],
  ]],
  ['Резка', [
    ['cutPrice', 10, 'Рез на гильотине — цена, ₽'],
    ['cutCost', 2, 'Рез на гильотине — себестоимость, ₽'],
  ]],
  ['Журнал: обложки и сборка', [
    ['coverCost', 1.5, 'Обложка картон-кожа А4 — закупка, ₽/шт'],
    ['coverMarkup', 140, 'Наценка на обложку, %', true],
    ['inkjetCost', 10, 'Печать лицевой обложки на струйном — себестоимость, ₽', true],
    ['inkjetPrice', 40, 'Печать лицевой обложки на струйном — цена, ₽', true],
    ['stapleCost', 0.1, 'Скоба — закупка, ₽ (пачка ~100 ₽ / 1000 шт)'],
    ['staplesPerBook', 3, 'Скоб на книгу, шт'],
    ['tapeMaskRoll', 40, 'Малярный скотч 1 см — рулон, ₽'],
    ['tapeBlackRoll', 50, 'Чёрный скотч 1,5 см — рулон, ₽'],
    ['tapeRollM', 10, 'Метров в рулоне скотча', true],
    ['tapePerBookM', 0.35, 'Скотча каждого вида на книгу, м', true],
    ['matMarkup', 140, 'Наценка на скобы, скотч и пружины, %', true],
    ['assemblyPrice', 100, 'Сборка книги на скобах — работа, ₽/шт', true],
    ['booksPerStack', 3, 'Книг в одной пачке под нож (подрезка), шт', true],
    ['trimCuts', 4, 'Резов на пачку книг: корешок + 3 стороны'],
  ]],
  ['Журнал: пружина и термоклей', [
    ['coilPlCost', 3, 'Пластиковая пружина: закупка — основа, ₽', true],
    ['coilPlMm', 0.4, 'Пластиковая пружина: + за каждый мм диаметра, ₽', true],
    ['coilMeCost', 6, 'Металлическая пружина: закупка — основа, ₽', true],
    ['coilMeMm', 0.8, 'Металлическая пружина: + за каждый мм диаметра, ₽', true],
    ['coilSqPct', 10, 'Металлическая пружина под квадратные отверстия дороже на, %', true],
    ['punchMax', 15, 'Брошюровщик пробивает за один раз, листов'],
    ['punchPass', 5, 'Перфорация — работа, ₽ за один проход', true],
    ['coilWork', 50, 'Набивка пружины — работа, ₽/книга', true],
    ['thermoCost', 25, 'Термообложка — закупка, ₽/шт', true],
    ['thermoWork', 120, 'Термоклеевой переплёт — работа, ₽/книга', true],
    ['sheetMm', 0.09, 'Толщина листа наполнения, мм (для подсказки пружины)', true],
  ]],
  ['Доли ФОТ и премии в цене строки', [
    ['shareLaunchFot', 45, 'Запуск ризографа — ФОТ, %'], ['shareLaunchPrem', 35, 'Запуск ризографа — премия, %'],
    ['sharePrepFot', 45, 'Подготовка мастеров — ФОТ, %'], ['sharePrepPrem', 35, 'Подготовка мастеров — премия, %'],
    ['shareFilmFot', 20, 'Мастер-плёнка — ФОТ, %'], ['shareFilmPrem', 15, 'Мастер-плёнка — премия, %'],
    ['shareInkFot', 20, 'Краска — ФОТ, %'], ['shareInkPrem', 15, 'Краска — премия, %'],
    ['sharePaperFot', 20, 'Бумага — ФОТ, %'], ['sharePaperPrem', 10, 'Бумага — премия, %'],
    ['shareCutFot', 45, 'Резка — ФОТ, %'], ['shareCutPrem', 25, 'Резка — премия, %'],
    ['shareCoverFot', 20, 'Обложки — ФОТ, %'], ['shareCoverPrem', 10, 'Обложки — премия, %'],
    ['shareInkjetFot', 20, 'Печать обложки — ФОТ, %'], ['shareInkjetPrem', 15, 'Печать обложки — премия, %'],
    ['shareMatFot', 20, 'Скобы, скотч, пружины — ФОТ, %'], ['shareMatPrem', 10, 'Скобы, скотч, пружины — премия, %'],
    ['shareAssemblyFot', 45, 'Сборка и переплёт — ФОТ, %'], ['shareAssemblyPrem', 35, 'Сборка и переплёт — премия, %'],
  ]],
];
export const POLY_TEMP = new Set(POLY_SETTINGS.flatMap(([, f]) => f.filter((x) => x[3]).map((x) => x[0])));
export const POLY_KEY = (k) => 'poly_' + k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

export const FORMATS = {
  A3: { name: 'А3', cap: 1, step: 25, cuts: 0 }, A4: { name: 'А4', cap: 2, step: 50, cuts: 1 }, A5: { name: 'А5', cap: 4, step: 100, cuts: 3 },
  A6: { name: 'А6', cap: 8, step: 200, cuts: 7 }, A7: { name: 'А7', cap: 16, step: 400, cuts: 15 }, DL: { name: 'DL', cap: 6, step: 150, cuts: 5 },
};
export const PAPER_IDS = { news49: ['News', 'Газетная 48,8 г'], off65: ['Off', 'Офсетная 65 г'], vatman: ['Vat', 'Ватман 180 г'] };
// пружины бывают двух видов; круглые или квадратные — это отверстия, их пробивает свой брошюровщик
export const BIND = { staple: 'Скобы и скотч', plastic: 'Пластиковая пружина', metal: 'Металлическая пружина', thermo: 'Термоклеевой переплёт' };
export const HOLES = { round: 'круглые', square: 'квадратные' };
export const COILS = { plastic: [6, 8, 10, 12, 14, 16, 19, 22, 25, 28, 32, 38, 45, 51], metal: [6.4, 7.9, 9.5, 11.1, 12.7, 14.3] };
const SHARE_KEY = { launch: 'shareLaunch', prep: 'sharePrep', film: 'shareFilm', ink: 'shareInk', paper: 'sharePaper', cut: 'shareCut', cover: 'shareCover', inkjet: 'shareInkjet', mat: 'shareMat', assembly: 'shareAssembly' };

// Настройки из базы → числа расчёта. s — app.refs.settings (ключ → значение)
export function polySettings(s = {}) {
  const v = {};
  for (const [, fields] of POLY_SETTINGS) for (const [k, d] of fields) {
    const raw = s[POLY_KEY(k)];
    v[k] = raw == null || raw === '' ? d : raw;
  }
  const n = (k) => Number(v[k]) || 0;
  const share = Object.fromEntries(Object.entries(SHARE_KEY).map(([kind, k]) => [kind, [n(k + 'Fot'), n(k + 'Prem')]]));
  const paper = Object.fromEntries(Object.entries(PAPER_IDS).map(([id, [p, name]]) => [id, { name, price: n(`paper${p}Price`), cost: n(`paper${p}Cost`), maxCut: Math.max(1, n(`paper${p}Cut`)) }]));
  const num = (key, d) => (s[key] == null || s[key] === '' || isNaN(Number(s[key])) ? d : Number(s[key]));
  return {
    v: n, share, paper,
    discountMaxPct: num('discount_max_pct', 15),
    urgency: { express: { pct: num('urgency_express_pct', 50), min: num('urgency_express_min', 500) }, urgent: { pct: num('urgency_urgent_pct', 100), min: num('urgency_urgent_min', 1000) } },
  };
}

// ФОТ и премия — доли цены строки; маржа строки = цена − себестоимость − ФОТ − премия
function finish(L, S) {
  for (const l of L) { const [f, p] = S.share[l.kind] || [0, 0]; l.fot = l.price * f / 100; l.prem = l.price * p / 100; l.margin = l.price - l.cost - l.fot - l.prem; }
  return L.reduce((a, l) => ({ price: a.price + l.price, cost: a.cost + l.cost, fot: a.fot + l.fot, prem: a.prem + l.prem, margin: a.margin + l.margin }), { price: 0, cost: 0, fot: 0, prem: 0, margin: 0 });
}
// приладка: 5 листов А3, на больших тиражах 1,5 %
const prilad = (a3, S) => Math.max(S.v('priladMin'), Math.ceil(a3 * S.v('priladPct') / 100));

// ---------- бланки ----------
// b: { fmt, color, paper }
export function calcBlank(qty, b, S) {
  const F = FORMATS[b.fmt], P = S.paper[b.paper];
  if (!F || !P) throw new Error('неизвестный формат или бумага');
  qty = Math.max(1, Math.round(qty));
  const a3 = Math.ceil(qty / F.cap), pr = prilad(a3, S), sheets = a3 + pr;
  const sides = b.color === '1+1' ? 2 : 1;
  const perSide = Math.max(1, Math.ceil(sheets / Math.max(1, S.v('masterMax'))));
  const mClient = sides * perSide; // клиенту двусторонний — всегда два мастера
  const mReal = perSide;           // по факту дуплекс печатается на одном мастере переворотом листа
  const impressions = sheets * sides;
  const packs = Math.ceil(sheets / P.maxCut), cuts = F.cuts * packs;
  const v = S.v, L = [];
  L.push({ name: 'Запуск ризографа', kind: 'launch', price: v('launchPrice'), cost: 0, qty: '1 раз' });
  L.push({ name: 'Подготовка мастеров', kind: 'prep', price: v('masterPrepPrice') * mClient, cost: v('masterPrepCost') * mReal, qty: mClient + ' шт' });
  L.push({ name: 'Мастер-плёнка А3', kind: 'film', price: v('filmPrice') * mClient, cost: v('filmCost') * mReal, qty: mClient + ' шт' + (mReal < mClient ? ` (по факту ${mReal})` : '') });
  L.push({ name: 'Краска', kind: 'ink', price: v('inkPrice') * impressions, cost: v('inkCost') * impressions, qty: fmtN(impressions) + ' отт.' });
  L.push({ name: 'Бумага ' + P.name + ', А3', kind: 'paper', price: P.price * sheets, cost: P.cost * sheets, qty: fmtN(sheets) + ' л' });
  if (cuts) L.push({ name: 'Резка А3 → ' + F.name, kind: 'cut', price: v('cutPrice') * cuts, cost: v('cutCost') * cuts, qty: cuts + ' рез.' });
  const T = finish(L, S);
  const per = Math.ceil(Math.round(T.price / qty * 1e6) / 1e4) / 100; // цена за штуку — вверх до копейки, итог = штука × тираж
  return { kind: 'blank', qty, L, T, per, total: Math.round(per * qty * 100) / 100, a3, pr, sheets, sides, mClient, mReal, impressions, cuts, packs };
}

// ---------- журнал / книга ----------
// bk: { id, sections: [{ name, sheets, color, paper, layout? }], bind, holes, coil, spread, frontNoPrint }
function runsOf(bk) {
  const runs = new Map();
  for (const s of bk.sections) {
    const key = (s.layout || (bk.id || '') + ':' + s.name) + '|' + s.color + '|' + s.paper;
    if (!runs.has(key)) runs.set(key, { color: s.color, paper: s.paper, a4: 0, names: [] });
    const r = runs.get(key); r.a4 += Math.max(0, Math.round(s.sheets)); r.names.push(s.name || 'Секция');
  }
  return [...runs.values()];
}

export function coilHint(bk, S) {
  const sheets = bk.sections.reduce((a, s) => a + Math.max(0, Math.round(s.sheets)), 0) + (bk.spread ? 1 : 0);
  const thick = sheets * S.v('sheetMm') + 1; // + обложки
  const list = bk.bind === 'plastic' ? COILS.plastic : COILS.metal;
  const need = thick * 1.3; // пружина свободнее блока примерно на треть
  return { sheets, thick, d: list.find((x) => x >= need) || list[list.length - 1], fits: list.some((x) => x >= need), list };
}

export function calcBook(books, bk, S) {
  books = Math.max(1, Math.round(books));
  const v = S.v;
  const runs = runsOf(bk).map((r) => ({ ...r, a4: r.a4 * books }));
  const twoSided = runs.find((r) => r.color === '1+1');
  const extraA3 = bk.spread && twoSided ? Math.ceil(books / 2) : 0;
  let mClient = 0, mReal = 0, impressions = 0, cutOps = 0;
  const paperUse = {}, bySec = [];
  for (const r of runs) {
    const P = S.paper[r.paper];
    if (!P) throw new Error('неизвестная бумага');
    const sides = r.color === '1+1' ? 2 : 1;
    const a3 = Math.ceil(r.a4 / 2), pr = prilad(a3, S), extra = r === twoSided ? extraA3 : 0, sheets = a3 + pr + extra;
    const perSide = Math.max(1, Math.ceil(sheets / Math.max(1, v('masterMax'))));
    mClient += sides * perSide; mReal += perSide;
    impressions += (a3 + pr) * sides + extra;
    paperUse[r.paper] = (paperUse[r.paper] || 0) + sheets;
    bySec.push({ names: r.names.join(' + '), color: r.color, paper: r.paper, paperName: P.name, a4: r.a4, a3, pr, extra, sides, masters: sides * perSide, mReal: perSide });
  }
  for (const [p, n] of Object.entries(paperUse)) cutOps += Math.ceil(n / S.paper[p].maxCut);
  const stacks = Math.ceil(books / Math.max(1, v('booksPerStack')));
  const L = [];
  const add = (name, kind, price, cost, qty, temp) => L.push({ name, kind, price, cost, qty, temp: !!temp });
  if (runs.length) {
    add('Запуск ризографа', 'launch', v('launchPrice'), 0, '1 раз');
    add('Подготовка мастеров', 'prep', v('masterPrepPrice') * mClient, v('masterPrepCost') * mReal, mClient + ' шт');
    add('Мастер-плёнка А3', 'film', v('filmPrice') * mClient, v('filmCost') * mReal, mClient + ' шт' + (mReal < mClient ? ` (по факту ${mReal})` : ''));
    add('Краска', 'ink', v('inkPrice') * impressions, v('inkCost') * impressions, fmtN(impressions) + ' отт.');
    for (const [p, n] of Object.entries(paperUse)) add('Бумага ' + S.paper[p].name + ', А3', 'paper', S.paper[p].price * n, S.paper[p].cost * n, fmtN(n) + ' л');
    add('Резка А3 → А4', 'cut', v('cutPrice') * cutOps, v('cutCost') * cutOps, cutOps + ' рез.');
  }
  const cover = v('coverCost') * (1 + v('coverMarkup') / 100), mm = 1 + v('matMarkup') / 100;
  const bind = bk.bind || 'staple';
  const T_ = (k) => POLY_TEMP.has(k);
  if (bind === 'thermo') add('Термообложка', 'cover', v('thermoCost') * mm * books, v('thermoCost') * books, books + ' шт', T_('thermoCost'));
  else { add('Обложка лицевая', 'cover', cover * books, v('coverCost') * books, books + ' шт', T_('coverMarkup')); add('Обложка задняя чёрная', 'cover', cover * books, v('coverCost') * books, books + ' шт', T_('coverMarkup')); }
  if (!bk.frontNoPrint) add('Печать лицевой обложки (струйный)', 'inkjet', v('inkjetPrice') * books, v('inkjetCost') * books, books + ' шт', T_('inkjetPrice'));
  let trims = 0, coil = null, passes = 0;
  if (bind === 'staple') {
    const staples = v('staplesPerBook') * books, tapeM = v('tapePerBookM') * books;
    add('Скобы', 'mat', v('stapleCost') * staples * mm, v('stapleCost') * staples, staples + ' шт', T_('matMarkup'));
    add('Скотч малярный 1 см', 'mat', v('tapeMaskRoll') / Math.max(0.01, v('tapeRollM')) * tapeM * mm, v('tapeMaskRoll') / Math.max(0.01, v('tapeRollM')) * tapeM, fmtN(tapeM, 2) + ' м', true);
    add('Скотч чёрный 1,5 см', 'mat', v('tapeBlackRoll') / Math.max(0.01, v('tapeRollM')) * tapeM * mm, v('tapeBlackRoll') / Math.max(0.01, v('tapeRollM')) * tapeM, fmtN(tapeM, 2) + ' м', true);
    add('Сборка: скобы, корешок, скотч', 'assembly', v('assemblyPrice') * books, 0, books + ' шт', T_('assemblyPrice'));
    trims = v('trimCuts');
  } else if (bind === 'thermo') {
    add('Термоклеевой переплёт — работа', 'assembly', v('thermoWork') * books, 0, books + ' шт', T_('thermoWork'));
    trims = 3; // подрезка с трёх сторон после склейки
  } else {
    const h = coilHint(bk, S);
    const d = bk.coil || h.d;
    coil = d;
    const metal = bind === 'metal', sq = metal && bk.holes === 'square';
    const c = (metal ? v('coilMeCost') + v('coilMeMm') * d : v('coilPlCost') + v('coilPlMm') * d) * (sq ? 1 + v('coilSqPct') / 100 : 1);
    add(`${BIND[bind]}${metal ? ', ' + HOLES[bk.holes || 'round'] + ' отверстия' : ''}, ⌀ ${fmtN(d, 1)} мм`, 'mat', c * mm * books, c * books, books + ' шт', true);
    // перфорация — отдельная операция: брошюровщик пробивает не больше 15 листов за раз
    passes = Math.ceil(h.sheets / Math.max(1, v('punchMax'))) * books;
    add(`Перфорация, ${metal ? HOLES[bk.holes || 'round'] + ' отверстия' : 'под пластиковую пружину'}`, 'assembly', v('punchPass') * passes, 0, passes + ' прох.', T_('punchPass'));
    add('Набивка пружины', 'assembly', v('coilWork') * books, 0, books + ' шт', T_('coilWork'));
  }
  if (trims) add('Подрезка книг на гильотине', 'cut', v('cutPrice') * trims * stacks, v('cutCost') * trims * stacks, trims * stacks + ' рез.');
  const T = finish(L, S);
  const per = Math.ceil(Math.round(T.price / books * 1e4) / 1e4); // цена книги — вверх до рубля, итог = цена книги × число книг
  const a3total = Object.values(paperUse).reduce((a, n) => a + n, 0);
  return { kind: 'book', qty: books, L, T, per, total: per * books, bySec, mClient, mReal, impressions, cutOps: cutOps + trims * stacks, a3total, extraA3, coil, passes };
}

// Задания для ризографа: что печатать, без цен. Печатник видит их в окне «Ризограф».
// Двусторонний журнал — два разных макета (поле под корешок слева и справа); двусторонний бланк — один мастер переворотом листа.
export function risoJobs(r, title, fmt, paperName = null) {
  if (r.kind === 'blank') return [{ title, fmt, color: r.sides === 2 ? '1+1' : '1+0', qty: r.qty, paper: paperName, layouts: 1, plus: 0 }];
  return r.bySec.map((x) => ({ title: `${title} · ${x.names}`, fmt: 'A4', color: x.color, qty: x.a4, paper: x.paperName, layouts: x.sides, plus: x.extra }));
}

// ---------- заказ: скидка и срочность (как в утверждённом прототипе) ----------
// res — результаты calcBlank/calcBook позиций заказа
export function polyOrder(res, { discountPct = 0, urgency = 'standard', role = 'manager' }, S) {
  const total = Math.round(res.reduce((a, r) => a + r.total, 0) * 100) / 100;
  const disc = urgency === 'standard' && role !== 'agent' ? Math.min(100, Math.max(0, Number(discountPct) || 0)) : 0;
  const dAmt = Math.round(total * disc) / 100;
  const base = total - dAmt;
  const u = S.urgency[urgency];
  const surcharge = u ? Math.round(Math.max(base * u.pct / 100, u.min)) : 0;
  const final = Math.ceil(Math.round((base + surcharge) * 100) / 100);
  const cost = res.reduce((a, r) => a + r.T.cost, 0), fot = res.reduce((a, r) => a + r.T.fot, 0), prem = res.reduce((a, r) => a + r.T.prem, 0);
  const margin = final - cost - fot - prem;
  const approvals = [];
  if (role !== 'director' && disc > S.discountMaxPct) approvals.push('discount_over_limit');
  if (role !== 'director' && margin < 0) approvals.push('negative_margin');
  const r2 = (x) => Math.round(x * 100) / 100;
  return { total, discountPct: disc, sumDiscount: r2(dAmt), sumUrgency: surcharge, final, cost: r2(cost), fot: r2(fot), prem: r2(prem), margin: r2(margin), approvals };
}
