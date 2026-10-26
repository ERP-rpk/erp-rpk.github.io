// Расчётное ядро ERP РПК: геометрия, раскладка, раскрой, цена, себестоимость.
// Чистые функции без DOM и без базы — одинаково работают в браузере и в тестах.
// Правила: docs/BUSINESS-RULES.md, docs/TZ-v7.2.md (раздел 4). Коды ошибок: docs/ERRORS.md.

export const SIDES = ['top', 'bottom', 'left', 'right'];

export const DEFAULT_SETTINGS = {
  seamOverlapMm: 10,
  eyeletStepMm: 300,
  eyeletEdgeMm: 15,
  pocketMm: 50,
  gluePerimeterMm: 50,
  stretcherMm: 25,
  stretcherBarStepMm: 750,     // поперечина подрамника через каждые 750 мм
  roundLengthMm: 50,
  roundPriceRub: 5,
  minPrintPriceRub: 150,
  discountMaxPct: 15,
  urgency: {
    standard: { pct: 0, min: 0 },
    express: { pct: 50, min: 500 },
    urgent: { pct: 100, min: 1000 },
  },
  taxUsnPct: 7,
  inkCostSqm: 0,               // стоимость чернил и сольвента на 1 м²
};

// Допы, которые взаимно исключают друг друга
const EXCLUSIVE = ['glue_perimeter', 'pocket', 'trim'];

export class CalcError extends Error {
  constructor(code, message, details) {
    super(`${code}: ${message}`);
    this.code = code;
    this.details = details;
  }
}

const ceilTo = (x, step) => Math.ceil(x / step - 1e-9) * step;
const sqm = (wMm, lMm) => (wMm / 1000) * (lMm / 1000);
const round2 = (x) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// Люверсы: угловые обязательны, каждая сторона делится на равные промежутки
// не длиннее шага. Итого = ∑(k+1) по сторонам − число общих углов.
// ---------------------------------------------------------------------------
export function eyeletCount(wMm, lMm, stepMm, sides = SIDES, edgeMm = 15) {
  if (!(stepMm > 0)) throw new CalcError('E07', 'шаг люверсов должен быть больше нуля');
  const len = { top: wMm, bottom: wMm, left: lMm, right: lMm };
  const set = new Set(sides);
  let total = 0;
  const perSide = {};
  for (const s of set) {
    const k = Math.max(1, Math.ceil((len[s] - 2 * edgeMm) / stepMm - 1e-9));
    perSide[s] = { intervals: k, count: k + 1, pitchMm: round2((len[s] - 2 * edgeMm) / k) };
    total += k + 1;
  }
  const corners = [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']];
  for (const [a, b] of corners) if (set.has(a) && set.has(b)) total -= 1;
  return { total, perSide };
}

// ---------------------------------------------------------------------------
// Размеры изделия: готовый (с белым полем) и печатный (с техническим запасом)
// ---------------------------------------------------------------------------
export function itemSizes(item, settings = DEFAULT_SETTINGS) {
  const { widthMm: W, lengthMm: L } = item;
  const R = item.frameMm ?? 0;
  if (!(W > 0 && L > 0)) throw new CalcError('E01', 'размеры изделия должны быть больше нуля');
  const opts = item.options || {};
  const used = EXCLUSIVE.filter((k) => opts[k]);
  if (used.length > 1) throw new CalcError('E04', 'проклейка, карман и обрезка в размер не совмещаются', { used });

  const fin = { w: W + 2 * R, l: L + 2 * R };
  const add = { top: 0, bottom: 0, left: 0, right: 0 };
  if (opts.stretcher) for (const s of SIDES) add[s] += settings.stretcherMm;
  if (opts.glue_perimeter) for (const s of opts.glue_perimeter.sides || SIDES) add[s] += settings.gluePerimeterMm;
  if (opts.pocket) for (const s of opts.pocket.sides || []) add[s] += opts.pocket.mm ?? settings.pocketMm;
  const print = { w: fin.w + add.left + add.right, l: fin.l + add.top + add.bottom };
  return { fin, print, add };
}

// Рабочая (печатная) ширина рулона: без защитных полей по бокам и не больше ширины печати принтера.
export function usableWidth(rollWidthMm, printer) {
  return Math.min(rollWidthMm - 2 * (printer.sideMarginMm ?? 0), printer.maxPrintWidthMm ?? rollWidthMm);
}

// Где по ширине рулона могут стоять изображения макетов (терминология владельца, 2026-10-24):
// - защитное поле (настройка, у нас 50 мм) — изображения печатаются только внутри него;
// - технический минимум (20 мм) — ближе к краю рулона не печатается ничего, в том числе Color Bar;
// - Color Bar: один раз на ряд, справа от крайнего макета, отступ colorBarGapMm (5 мм), ширина colorBarMm (10 мм);
//   может лежать на защитном поле, если не ближе технического минимума;
// - белое поле R вокруг каждого макета не печатается: лежит и на защитном поле, но не за краем рулона.
// Возвращает левую и правую границы изображений, отсчёт от левого края рулона.
export function imageBounds(rollWidthMm, printer, R) {
  const side = printer.sideMarginMm ?? 0;
  const edge = printer.edgeMinMm ?? 0;
  const bar = printer.colorBarEnabled === false ? 0 : (printer.colorBarMm ?? 0);
  const gapBar = bar > 0 ? (printer.colorBarGapMm ?? 5) + bar : 0;
  const maxW = printer.maxPrintWidthMm ?? rollWidthMm;
  const left = Math.max(side, R, edge);
  const right = Math.min(rollWidthMm - side, rollWidthMm - edge - gapBar, rollWidthMm - R, left + maxW - gapBar);
  return { left, right, gapBar };
}

// ---------------------------------------------------------------------------
// Раскладка одной позиции на рулоне заданной ширины.
// Возвращает null, если не помещается (и раскрой запрещён или невозможен).
// ---------------------------------------------------------------------------
export function layoutOnRoll(sizes, qty, rollWidthMm, printer, category, opts = {}, settings = DEFAULT_SETTINGS) {
  const usable = usableWidth(rollWidthMm, printer);
  const { w, l } = sizes.print;
  const R = sizes.frameMm ?? 0;
  // Изображения — между границами imageBounds; макет с белым полем шире изображения на 2R,
  // поэтому ряд макетов (с белым полем) может занимать ширину (right − left) + 2R.
  // По длине белое поле ложится на начало (снизу) и конец печати (сверху), но не за край материала.
  const bounds = imageBounds(rollWidthMm, printer, R);
  const fitW = bounds.right - bounds.left + 2 * R;
  const lead = printer.leadMm ?? 0, tail = printer.tailMm ?? 0;
  const slackL = Math.min(R, lead) + Math.min(R, tail);
  const variants = [];

  // Без раскроя: изделия рядами поперёк рулона, два поворота
  if (!opts.forceSplit) {
    for (const [across, along, rotated] of [[w, l, false], [l, w, true]]) {
      if (across > fitW) continue;
      const perRow = Math.floor(fitW / across);
      const rows = Math.ceil(qty / perRow);
      variants.push({
        split: false, rotated, strips: 1, perRow, rows,
        pieceAcrossMm: across, pieceAlongMm: along,
        layoutLengthMm: rows * along,
        printedSqm: qty * sqm(w, l),
        seams: 0, seamLengthMm: 0,
      });
    }
  }

  // Раскрой: изображение режется на N полос с нахлёстом, у каждой полосы своё белое поле.
  // Полосы идут друг за другом по длине рулона.
  const needSplit = Math.min(w, l) > fitW;
  if (category.splitAllowed && (needSplit || opts.forceSplit)) {
    const ov = settings.seamOverlapMm;
    for (const [cutSide, otherSide, rotated] of [[w, l, false], [l, w, true]]) {
      const image = cutSide - 2 * R;          // сторона без белого поля
      let N = 2;
      while (N <= 50 && (image + (N - 1) * ov) / N + 2 * R > fitW) N++;
      if (N > 50) continue;
      const stripImage = (image + (N - 1) * ov) / N;
      const stripAcross = stripImage + 2 * R;
      variants.push({
        split: true, rotated, strips: N, perRow: 1, rows: N * qty,
        pieceAcrossMm: round2(stripAcross), pieceAlongMm: otherSide,
        stripImageMm: round2(stripImage),
        layoutLengthMm: N * qty * otherSide,
        printedSqm: qty * N * sqm(stripAcross, otherSide),
        seams: N - 1, seamLengthMm: otherSide - 2 * R, seamOverlapMm: ov,
      });
    }
  }

  if (!variants.length) return null;
  const rollLen = (v) => ceilTo((printer.leadMm ?? 0) + v.layoutLengthMm + (printer.tailMm ?? 0) - slackL, settings.roundLengthMm);
  for (const v of variants) {
    v.rollWidthMm = rollWidthMm;
    v.usableWidthMm = usable;
    v.frameMm = R;
    v.imageRightMm = bounds.right;               // правый край изображений (раскладка прижата вправо)
    v.slackLeadMm = Math.min(R, lead);
    v.slackTailMm = Math.min(R, tail);
    v.rollLengthMm = rollLen(v);
    v.usedSqm = sqm(rollWidthMm, v.rollLengthMm);
    v.wasteSqm = Math.max(0, v.usedSqm - v.printedSqm);
    v.score = layoutScore(v, qty, category, opts);
  }
  variants.sort((a, b) => a.score - b.score || a.strips - b.strips);
  return { ...variants[0], needSplit };
}

// Оценка варианта раскладки: сколько он стоит клиенту — печать, перерасход и склейка швов.
// Так лишние швы не выбираются ради копеечной экономии материала.
export function layoutScore(v, qty, category, opts = {}) {
  const seamM = category.seamGlue ? qty * v.seams * (v.seamLengthMm / 1000) : 0;
  const price = v.printedSqm * (category.pricePrintSqm ?? 0) + v.wasteSqm * (category.priceWasteSqm ?? 0) + seamM * (opts.seamPricePerM ?? 0);
  return price || v.usedSqm; // без цен — просто по расходу
}

// ---------------------------------------------------------------------------
// Выбор рулона: рулоны в наличии (FIFO по дате), с запасом длины; иначе — по ширине из справочника.
// Возвращает лучший вариант по расходу материала, рулоны в наличии в приоритете.
// ---------------------------------------------------------------------------
export function chooseLayout(sizes, qty, category, printer, rolls, opts = {}, settings = DEFAULT_SETTINGS) {
  const candidates = [];
  const byWidth = new Map();
  for (const r of rolls) {
    if (usableWidth(r.widthMm, printer) <= 0) continue;
    if (!byWidth.has(r.widthMm)) byWidth.set(r.widthMm, []);
    byWidth.get(r.widthMm).push(r);
  }
  for (const [width, list] of byWidth) {
    const lay = layoutOnRoll(sizes, qty, width, printer, category, opts, settings);
    if (!lay) continue;
    list.sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate)));
    const roll = list.find((r) => r.leftMm == null || r.leftMm >= lay.rollLengthMm) || null;
    candidates.push({ ...lay, roll, inStock: !!roll });
  }
  if (!candidates.length) {
    const cut = category.splitAllowed ? 'нет подходящего рулона' : 'материал не режется, а макет не помещается на рулон целиком';
    throw new CalcError(category.splitAllowed ? 'E03' : 'E02', cut);
  }
  candidates.sort((a, b) => (b.inStock - a.inStock) || (a.score - b.score) || (a.rollWidthMm - b.rollWidthMm));
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Обрезки: предлагаются, только если вся позиция помещается в обрезок целиком — и по ширине, и по длине,
// без раскроя (BUSINESS-RULES → «Обрезки»). Обрезок кладётся любой стороной поперёк принтера.
// Печать на обрезке идёт по тем же правилам, что на рулоне: защитные поля, начало и конец печати.
// Самые маленькие подходящие — первыми, чтобы большие куски оставались для больших макетов.
// ---------------------------------------------------------------------------
export function fitOffcuts(sizes, qty, category, printer, offcuts, settings = DEFAULT_SETTINGS) {
  const out = [];
  for (const o of offcuts || []) {
    for (const [across, along] of [[o.widthMm, o.lengthMm], [o.lengthMm, o.widthMm]]) {
      if (across > (printer.maxPrintWidthMm ?? across)) continue;
      const lay = layoutOnRoll(sizes, qty, across, printer, category, {}, settings);
      if (lay && !lay.split && lay.rollLengthMm <= along) { out.push({ ...o, acrossMm: across, layout: lay }); break; }
    }
  }
  return out.sort((a, b) => a.widthMm * a.lengthMm - b.widthMm * b.lengthMm);
}

// ---------------------------------------------------------------------------
// Допы: количество в единицах допа на всю позицию
// ---------------------------------------------------------------------------
export function optionQuantities(item, sizes, layout, category, settings = DEFAULT_SETTINGS) {
  const o = item.options || {};
  const qty = item.qty ?? 1;
  const { w, l } = sizes.fin;
  const perimeterM = (2 * (w + l)) / 1000;
  const sideLen = { top: w, bottom: w, left: l, right: l };
  const sidesM = (sides) => sides.reduce((s, k) => s + sideLen[k], 0) / 1000;
  const q = {};

  for (const code of Object.keys(o)) {
    if (!o[code]) continue;
    if (code === 'seam_glue' || code === 'raskroy') continue; // склейка ставится сама, раскрой — не доп
    if (category.allowedOptions && !category.allowedOptions.includes(code)) {
      throw new CalcError('E06', `доп «${code}» недоступен для этого материала`);
    }
  }
  if (o.eyelets) {
    q.eyelets = qty * eyeletCount(w, l, o.eyelets.step ?? settings.eyeletStepMm, o.eyelets.sides || SIDES, settings.eyeletEdgeMm).total;
  }
  if (o.glue_perimeter) q.glue_perimeter = qty * sidesM(o.glue_perimeter.sides || SIDES);
  if (o.pocket) q.pocket = qty * sidesM(o.pocket.sides || []);
  if (o.trim) q.trim = qty * perimeterM;
  if (o.mount) q.mount = qty * sqm(w, l);
  if (o.mount_pvc) q.mount_pvc = qty * sqm(w, l);
  if (o.pvc_cut) q.pvc_cut = qty * perimeterM;
  if (o.edge_fold) q.edge_fold = qty * perimeterM;
  if (o.laminate) q.laminate = qty * sqm(w, l);
  if (o.stretcher) q.stretcher = qty * sqm(w, l);
  if (o.stretcher) {
    // длина рейки подрамника: периметр + поперечины через каждые 750 мм (материал услуги «натяжка»)
    const W = item.widthMm, L = item.lengthMm, step = settings.stretcherBarStepMm;
    q._frameM = qty * ((2 * (W + L)) / 1000 + Math.floor(W / step) * (L / 1000) + Math.floor(L / step) * (W / 1000));
  }
  if (o.canvas_edges) q.canvas_edges = qty * perimeterM;
  if (layout.split && category.seamGlue) q.seam_glue = qty * layout.seams * (layout.seamLengthMm / 1000);
  for (const k of Object.keys(q)) q[k] = round2(q[k]);
  return q;
}

// Цена 1 пог. м шва для выбора варианта раскроя: работа + скотч и клей
const seamPrice = (p) => (p ? (p.price ?? 0) + (p.goods || []).reduce((s, g) => s + (g.qtyPerUnit ?? 1) * (g.price ?? 0), 0) : 0);

// ---------------------------------------------------------------------------
// Позиция заказа
// item: { widthMm, lengthMm, qty, frameMm, options, rollId? }
// ctx:  { category, printer, rolls, optionPrices: {code: {price, min, cost}}, settings }
// ---------------------------------------------------------------------------
export function calcItem(item, ctx) {
  const settings = { ...DEFAULT_SETTINGS, ...(ctx.settings || {}) };
  const qty = item.qty ?? 1;
  if (!(Number.isInteger(qty) && qty > 0)) throw new CalcError('E05', 'количество — целое число больше нуля');
  const category = ctx.category;
  // белое поле не задано (пусто) — берём белое поле материала
  const frame = item.frameMm === '' || item.frameMm == null || isNaN(Number(item.frameMm)) ? (category.whiteMarginMm ?? 0) : Number(item.frameMm);
  const item2 = { ...item, frameMm: frame };
  const sizes = { ...itemSizes(item2, settings), frameMm: item2.frameMm };

  let rolls = ctx.rolls;
  if (item.rollId) rolls = rolls.filter((r) => r.id === item.rollId); // ручная замена рулона
  const layout = chooseLayout(sizes, qty, category, ctx.printer, rolls,
    { forceSplit: !!item.options?.raskroy, seamPricePerM: seamPrice(ctx.optionPrices?.seam_glue) }, settings);

  // Обрезки, в которые помещается позиция. Цена клиенту от обрезка не зависит — меняется только себестоимость.
  const offcutFits = layout.split ? [] : fitOffcuts(sizes, qty, category, ctx.printer, ctx.offcuts, settings);
  const offcut = item.offcutId ? offcutFits.find((o) => o.id === item.offcutId) || null : null;

  const optQty = optionQuantities(item2, sizes, layout, category, settings);
  const post = {};
  let sumPost = 0;
  let costOptions = 0;
  // Услуга постпечати: работа (цена × количество) + материалы, которые она списывает (люверсы, ПВХ, рейка, скотч…).
  // Берётся большее из этой суммы и минимальной суммы услуги. В себестоимость идёт закупка материалов.
  for (const [code, n] of Object.entries(optQty)) {
    if (code.startsWith('_')) continue;
    const p = ctx.optionPrices?.[code];
    if (!p) throw new CalcError('E08', `нет цены для услуги «${code}»`);
    const materials = (p.goods || []).map((g) => {
      const gq = round2(g.basis === 'frame' ? (optQty._frameM ?? 0) : n * (g.qtyPerUnit ?? 1));
      costOptions += gq * (g.cost ?? 0);
      return { name: g.name, unit: g.unit, qty: gq, sum: round2(gq * (g.price ?? 0)) };
    });
    const work = n * p.price;
    const sum = Math.max(work + materials.reduce((s, m) => s + m.sum, 0), p.min ?? 0);
    costOptions += n * (p.cost ?? 0);
    post[code] = { qty: n, price: p.price, min: p.min ?? 0, work: round2(work), materials, sum: round2(sum) };
    sumPost += sum;
  }

  const sumPrint = Math.max(layout.printedSqm * category.pricePrintSqm, settings.minPrintPriceRub);
  const sumWaste = layout.wasteSqm * category.priceWasteSqm;

  // Себестоимость
  const roll = layout.roll;
  const costMaterial = offcut ? (offcut.costSqm != null ? offcut.layout.usedSqm * offcut.costSqm : 0)
    : roll?.costSqm != null ? layout.usedSqm * roll.costSqm : 0;
  const costInk = layout.printedSqm * settings.inkCostSqm;
  const head = ctx.printer.headCost && ctx.printer.headResourceSqm ? layout.printedSqm * ctx.printer.headCost / ctx.printer.headResourceSqm : 0;

  return {
    sizes, layout, options: post, offcutFits, offcut,
    sumPrint: round2(sumPrint),
    sumPost: round2(sumPost),
    sumWaste: round2(sumWaste),
    cost: round2(costMaterial + costInk + head + costOptions),
    costParts: { material: round2(costMaterial), ink: round2(costInk), head: round2(head), options: round2(costOptions) },
  };
}

// ---------------------------------------------------------------------------
// Итог заказа: скидка, срочность, округление, маржа, подтверждение директора
// order: { items, discountPct, urgency, role, agentMarkupPct, agentDiscountPct }
// ---------------------------------------------------------------------------
export function calcOrder(order, ctxFor) {
  const settings = { ...DEFAULT_SETTINGS, ...(ctxFor.settings || {}) };
  const role = order.role || 'manager';
  const urgency = order.urgency || 'standard';
  let discountPct = order.discountPct || 0;
  if (urgency !== 'standard' || role === 'agent') discountPct = 0; // срочность обнуляет скидку; агент не даёт нашу скидку
  if (discountPct < 0 || discountPct > 100) throw new CalcError('E09', 'скидка — от 0 до 100%');

  const items = order.items.map((it) => calcItem(it, ctxFor.item(it)));
  const step = settings.roundPriceRub;
  let base = 0, waste = 0, discount = 0, cost = 0;
  for (const r of items) {
    const b = r.sumPrint + r.sumPost;
    const d = b * discountPct / 100;
    r.discount = round2(d);
    r.total = ceilTo(b - d + r.sumWaste, step);
    base += b; waste += r.sumWaste; discount += d; cost += r.cost;
  }
  const subtotal = items.reduce((s, r) => s + r.total, 0);
  const u = settings.urgency[urgency] || { pct: 0, min: 0 };
  const surcharge = urgency === 'standard' ? 0 : ceilTo(Math.max(subtotal * u.pct / 100, u.min), step);
  const total = subtotal + surcharge;
  const tax = total * settings.taxUsnPct / 100;
  const margin = total - cost - tax;

  const approvals = [];
  if (role !== 'director' && discountPct > settings.discountMaxPct) approvals.push('discount_over_limit');
  if (role !== 'director' && margin < 0) approvals.push('negative_margin');

  const res = {
    items,
    discountPct,
    sumPrint: round2(items.reduce((s, r) => s + r.sumPrint, 0)),
    sumPost: round2(items.reduce((s, r) => s + r.sumPost, 0)),
    sumWaste: round2(waste),
    sumDiscount: round2(discount),
    sumUrgency: surcharge,
    total,
    cost: round2(cost),
    tax: round2(tax),
    margin: round2(margin),
    approvals,
  };
  if (role === 'agent') {
    const agentPrice = ceilTo(total * (1 + (order.agentMarkupPct || 0) / 100), step);
    res.agent = { price: agentPrice, priceWithDiscount: ceilTo(agentPrice * (1 - (order.agentDiscountPct || 0) / 100), step) };
  }
  return res;
}

// Ключ черновика: размеры без учёта поворота (W×L = L×W)
export function draftKey(widthMm, lengthMm) {
  return `${Math.min(widthMm, lengthMm)}x${Math.max(widthMm, lengthMm)}`;
}
