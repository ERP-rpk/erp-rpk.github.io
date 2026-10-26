// Экран «Настройки»: всё, что влияет на расчёт и работу, директор меняет сам.
// Разделы описаны данными (поля, подсказки), форма и сохранение — общие.
import { app, setTitle } from '../app.js?v=f8825c7';
import { $, $$, esc, num, rub, dt, toast, modal, errText, ROLE, PERMS, numInputs, parseIn, fmtIn } from '../ui.js?v=f8825c7';
import { POLY_SETTINGS, POLY_KEY } from '../poly-core.js?v=f8825c7';
import { widthsTable } from '../price-rec.js?v=f8825c7';

const KIND = { banner: 'Баннер', banner_cast: 'Баннер литой', mesh: 'Сетка', self_adhesive: 'Самоклейка', canvas: 'Холст', photo_paper: 'Фотобумага', other: 'Другое' };
const BLOCK = { PRINT_BLOCK: 'Печать', POSTPRINT_BLOCK: 'Постпечать' };
const UNITS = { 'шт': 'шт', 'пог.м': 'пог. м', 'м²': 'м²' };
const MODE = { auto: 'Автоматически от закупки и наценки', manual: 'Вручную' };
const ceil5 = (x) => Math.ceil(x / 5) * 5;
const R2 = (x) => num(x) + ' ₽';

// ---------- разделы-таблицы ----------
export const TABLES = {
  printers: {
    title: 'Оборудование', table: 'printers', id: 'id', perm: 'settings', order: 'name',
    sub: 'Карточки принтеров. От этих полей зависит, сколько макета влезает на рулон и как рисуется схема.',
    card: (r) => `${esc(r.name)}${r.active ? '' : ' · <span class="muted">выключен</span>'}<div class="muted small">ширина печати ${num(r.max_print_width_mm, 0)} · защитное ${r.side_margin_mm} · тех. минимум ${r.edge_min_mm ?? 20} · начало ${r.lead_mm} / конец ${r.tail_mm} · ${r.color_bar_enabled === false ? 'без Color Bar' : `Color Bar ${r.color_bar_mm} через ${r.color_bar_gap_mm ?? 5} мм`}</div>`,
    fields: [
      ['name', 'Название', 'text'],
      ['max_print_width_mm', 'Максимальная ширина печати, мм', 'int', 'самый широкий рулон, который берёт принтер'],
      ['side_margin_mm', 'Защитное поле по бокам, мм', 'int', 'макеты печатаются только внутри него; белое поле и Color Bar могут на него заходить'],
      ['edge_min_mm', 'Технический минимум от края рулона, мм', 'int', 'ближе к краю не печатается ничего, в том числе Color Bar; защитное поле не может быть меньше'],
      ['lead_mm', 'Начало печати, мм', 'int', 'снизу на схеме — рулон идёт на нас'],
      ['tail_mm', 'Конец печати, мм', 'int', 'сверху на схеме — обрезка'],
      ['color_bar_enabled', 'Печатать Color Bar', 'bool', 'полоса чистых цветов справа от макетов, чтобы не засыхала голова; выключите, если ваш принтер печатает без неё'],
      ['color_bar_mm', 'Color Bar: ширина, мм', 'int', 'один раз на ряд, справа от крайнего макета'],
      ['color_bar_gap_mm', 'Color Bar: отступ от макета, мм', 'int'],
      ['active', 'Принтер работает', 'bool'],
      ['purchase_price', 'Цена покупки, ₽', 'num', 'для амортизации в отчёте директора'],
      ['life_months', 'Срок службы, мес.', 'int'],
      ['head_cost', 'Стоимость печатающей головы, ₽', 'num'],
      ['head_resource_sqm', 'Ресурс головы, м²', 'num', 'оставьте пустым, пока не накопятся данные'],
    ],
  },
  categories: {
    title: 'Печатные материалы', table: 'material_categories', id: 'id', perm: 'nomenclature', order: 'name', copyable: true,
    sub: 'Виды материала, на которых печатаем, и цена печати на них. Цена клиенту не зависит от того, какой рулон пошёл в работу. Для рулонов по особой цене (например, по акции) сделайте копию материала и перенесите туда рулон на складе.',
    card: (r) => `${esc(r.name)}${r.active ? '' : ' · <span class="muted">скрыт</span>'} <span class="chip nodot">${r.price_mode === 'manual' ? 'цена вручную' : 'цена от закупки'}</span>${r.rec_at ? ` <span class="chip warn nodot">рекомендуем ${rub(r.rec_print_sqm)}</span>` : ''}<div class="muted small">печать ${num(r.price_print_sqm, 0)} ₽/м² · перерасход ${num(r.price_waste_sqm, 0)} ₽/м²${r.base_cost_sqm ? ` · закупка ${num(r.base_cost_sqm)} ₽/м²${r.cost_basis?.widths?.length > 1 ? ` (${W(r.cost_basis.width_mm)}, самая дорогая из ${r.cost_basis.widths.length} ширин)` : ''}` : ''} · белое поле ${r.white_margin_mm} мм · ${r.split_allowed ? 'раскрой можно' : 'не режется'}</div>`,
    fields: [
      ['name', 'Название', 'text'],
      ['kind', 'Вид', 'select', null, KIND],
      ['price_mode', 'Как считать цену', 'select', 'автоматически: закупка 1 м² самой дорогой ширины в работе × (1 + наценка), с округлением до 5 ₽, плюс чернила. Пришёл рулон с другой ценой — система предложит новую цену с расчётом, а вы её примете или оставите старую', MODE],
      ['markup_print_pct', 'Наценка на печать, %', 'num', 'например, 150 — цена материала в цене печати = закупка × 2,5'],
      ['markup_waste_pct', 'Наценка на перерасход, %', 'num', 'неиспользованная часть рулона; скидка на неё не действует'],
      ['current_cost_sqm', 'Текущая закупка 1 м², ₽', 'num', 'обычно не нужна: цена считается от рулонов. Заполните, только если знаете, что материал подорожал, а нового рулона ещё нет — берётся большее'],
      ['_widths', 'Закупка по ширинам', 'widths'],
      ['_pv', '', 'preview'],
      ['price_print_sqm', 'Цена печати, ₽/м²', 'num', 'материал + чернила; в режиме «автоматически» считается сама', null, { auto: true }],
      ['price_waste_sqm', 'Цена перерасхода, ₽/м²', 'num', null, null, { auto: true }],
      ['white_margin_mm', 'Белое поле по умолчанию, мм', 'int'],
      ['split_allowed', 'Раскрой разрешён', 'bool'],
      ['seam_glue', 'Полосы клеятся в цеху', 'bool', 'склейка начисляется по длине шва'],
      ['offcut_min_w_mm', 'Минимальный обрезок: ширина, мм', 'int', 'пусто — обрезки не сохранять'],
      ['offcut_min_l_mm', 'Минимальный обрезок: длина, мм', 'int'],
      ['allowed_options', 'Доступная постпечать', 'options'],
      ['active', 'Показывать в калькуляторе', 'bool'],
    ],
    preview: (d, row) => {
      const rollBase = Number(row?.cost_basis?.base) || 0;
      if (d.price_mode !== 'auto') {
        // вручную можно всё, но перерасход дешевле закупки — это продажа в минус
        if (rollBase && Number(d.price_waste_sqm) < rollBase) return { kind: 'bad', t: `Перерасход ${rub(d.price_waste_sqm)}/м² дешевле закупки самой дорогой ширины (${R2(rollBase)} за м²) — каждый метр перерасхода продаётся в минус.` };
        return '';
      }
      // ориентир до сохранения; точную цену считает база по самой дорогой ширине в работе
      const b = Math.max(rollBase, Number(d.current_cost_sqm) || 0);
      if (!b) return 'Цена посчитается, когда появится рулон с ценой закупки или текущая закупка.';
      const ink = Number(app.refs.settings.ink_client_price_sqm ?? 0);
      return `Закупка ${num(b)} ₽/м² → печать ${rub(ceil5(b * (1 + (Number(d.markup_print_pct) || 0) / 100)) + ink)}/м² (в т. ч. чернила ${rub(ink)}), перерасход ${rub(ceil5(b * (1 + (Number(d.markup_waste_pct) || 0) / 100)))}/м². Сохраните — цена встанет сразу.`;
    },
  },
  goods: {
    title: 'Прочие материалы', table: 'goods', id: 'id', perm: 'nomenclature', order: 'name',
    sub: 'Материалы и расходники, которые списывает постпечать: люверсы, ПВХ, рейка, скотч, клей. Позже сюда добавим бумагу для типографии.',
    card: (r) => `${esc(r.name)}${r.active === false ? ' · <span class="muted">выключен</span>' : ''} <span class="chip nodot">${r.kind === 'consumable' ? 'расходник' : 'материал'}</span><div class="muted small">клиенту ${num(r.price_rub)} ₽ за ${esc(r.unit)}${r.purchase_price != null ? ` · закупка ${num(r.purchase_price)} ₽` : ''}${r.price_mode === 'auto' ? ` · наценка ${num(r.markup_pct)}%` : ' · цена вручную'}</div>`,
    fields: [
      ['name', 'Название', 'text'],
      ['unit', 'Единица', 'select', null, UNITS],
      ['kind', 'Тип', 'select', 'материал — входит в изделие (люверс, рейка, ПВХ); расходник — тратится при работе (скотч, клей)', { material: 'Материал', consumable: 'Расходник' }],
      ['purchase_price', 'Закупка за единицу, ₽', 'num', 'идёт в себестоимость заказа'],
      ['price_mode', 'Как считать цену для клиента', 'select', null, MODE],
      ['markup_pct', 'Наценка, %', 'num', 'цена = закупка × (1 + наценка), с округлением вверх до рубля'],
      ['_pv', '', 'preview'],
      ['price_rub', 'Цена для клиента за единицу, ₽', 'num', 'в режиме «автоматически» считается сама', null, { auto: true }],
      ['active', 'Используется', 'bool'],
    ],
    preview: (d) => (d.price_mode === 'auto' && d.purchase_price != null ? `Цена для клиента: ${rub(Math.ceil(d.purchase_price * (1 + (Number(d.markup_pct) || 0) / 100)))} за единицу` : ''),
  },
  options: {
    title: 'Постпечать', table: 'options', id: 'code', perm: 'nomenclature', order: 'name', goodsEditor: true,
    sub: 'Услуги после печати. Цена = работа × количество + материалы, которые услуга списывает; но не меньше минимальной суммы.',
    card: (r) => {
      const links = (app.refs.optionGoods || []).filter((l) => l.option_code === r.code);
      const mats = links.map((l) => app.refs.goods.find((g) => g.id === l.good_id)?.name).filter(Boolean).join(', ');
      return `${esc(r.name)}${r.active ? '' : ' · <span class="muted">выключена</span>'}<div class="muted small">работа ${num(r.price)} ₽ за ${esc(r.unit)} · минимум ${num(r.min_price, 0)} ₽${mats ? ` · материалы: ${esc(mats)}` : ''}</div>`;
    },
    fields: [
      ['code', 'Код (латиницей, не меняется)', 'text', null, null, { createOnly: true }],
      ['name', 'Название', 'text'],
      ['unit', 'Единица', 'select', null, UNITS],
      ['price', 'Работа: цена за единицу, ₽', 'num', 'без материалов — они добавятся сами'],
      ['min_price', 'Минимальная сумма, ₽', 'num', 'если «количество × цена + материалы» меньше, берётся минимум'],
      ['active', 'Включена', 'bool'],
    ],
  },
  works: {
    title: 'Работы и ставки', table: 'works', id: 'id', perm: 'settings', order: 'name',
    sub: 'Сдельная оплата сотрудникам за операции. Норматив — сколько минут обычно занимает операция: нужен, чтобы позже планировать загрузку цеха и сверять оплату со временем. Можно не заполнять, пока не замерили на нескольких заказах.',
    card: (r) => `${esc(r.name)} <span class="chip nodot">${BLOCK[r.block]}</span>${r.rate == null ? ' <span class="chip warn nodot">без ставки</span>' : ''}<div class="muted small">${r.rate == null ? '—' : r.rate_type === 'pct' ? num(r.rate) + '%' : num(r.rate) + ' ₽ за ' + esc(r.unit)}${r.norm_minutes ? ' · норматив ' + num(r.norm_minutes) + ' мин' : ''}</div>`,
    fields: [
      ['name', 'Название', 'text'],
      ['block', 'Блок', 'select', null, BLOCK],
      ['unit', 'Единица', 'select', null, UNITS],
      ['rate_type', 'Тип ставки', 'select', null, { rub: '₽ за единицу', pct: '% от суммы' }],
      ['rate', 'Ставка', 'num', 'пусто — ставка не задана'],
      ['norm_minutes', 'Норматив, мин', 'num', 'среднее время операции; замерьте секундомером на 3–5 заказах'],
      ['active', 'Действует', 'bool'],
    ],
  },
  kits: {
    title: 'Комплекты', table: 'kits', id: 'id', perm: 'nomenclature', order: 'sort', deletable: true,
    sub: 'Готовые заготовки позиций: менеджер выбирает комплект одной кнопкой.',
    card: (r) => `${esc(r.name)}<div class="muted small">${esc(app.refs.categories.find((c) => c.id === r.category_id)?.name || '—')} · ${r.width_mm}×${r.length_mm} мм · ${r.qty} шт</div>`,
    fields: [
      ['name', 'Название', 'text'],
      ['category_id', 'Печатный материал', 'category'],
      ['width_mm', 'Ширина, мм', 'int'],
      ['length_mm', 'Длина, мм', 'int'],
      ['frame_mm', 'Белое поле, мм', 'int'],
      ['qty', 'Количество', 'int'],
      ['options', 'Постпечать', 'kitopts'],
      ['sort', 'Порядок в списке', 'int'],
    ],
  },
  methods: {
    title: 'Способы оплаты', table: 'payment_methods', id: 'code', perm: 'settings', order: 'sort',
    sub: 'Цена от способа оплаты не зависит. Комиссия идёт в отчёт о прибыли.',
    card: (r) => `${esc(r.name)}${r.active ? '' : ' · <span class="muted">выключен</span>'}<div class="muted small">комиссия ${num(r.fee_pct)}%</div>`,
    fields: [
      ['code', 'Код (латиницей, не меняется)', 'text', null, null, { createOnly: true }],
      ['name', 'Название', 'text'],
      ['fee_pct', 'Комиссия, %', 'num'],
      ['active', 'Принимаем', 'bool'],
      ['sort', 'Порядок', 'int'],
    ],
  },
};

// ---------- калькулятор (таблица settings: ключ → значение) ----------
const CALC_KEYS = [
  ['Раскрой', [
    ['seam_overlap_mm', 'Нахлёст шва, мм', 'обычно 10 мм; ставится автоматически, менеджер не вводит'],
  ]],
  ['Люверсы', [
    ['eyelet_step_mm', 'Шаг люверсов по умолчанию, мм', 'промежутки между люверсами не длиннее шага'],
    ['eyelet_edge_mm', 'Отступ люверса от края, мм', 'от края изделия до центра люверса'],
  ]],
  ['Запасы материала на обработку', [
    ['glue_perimeter_mm', 'Проклейка периметра, мм на сторону', 'сколько материала добавляется к готовому размеру (макет + белое поле) на подгиб под проклейку'],
    ['pocket_mm', 'Карман под трубу, мм на сторону', 'сколько материала добавляется к готовому размеру (макет + белое поле) на подгиб кармана'],
    ['stretcher_mm', 'Автоматический вылет для натяжки на подрамник, мм', 'на сколько печать выходит за размер картины с каждой стороны, чтобы завернуть на подрамник'],
  ]],
  ['Цена и округления', [
    ['min_print_price_rub', 'Минимальная стоимость печати позиции, ₽', 'из неё оплачиваются загрузка рулона и риповка'],
    ['ink_client_price_sqm', 'Чернила в цене печати, ₽/м²', 'добавляется к цене печати материалов в автоматическом режиме'],
    ['price_width_active_months', 'Ширина в работе, если покупали за, мес.', 'цена материала считается от самой дорогой ширины в работе: есть на складе или покупали за это время'],
    ['round_price_rub', 'Округление цены, ₽'],
    ['round_length_mm', 'Округление длины рулона, мм'],
  ]],
  ['Себестоимость и прочее', [
    ['ink_norm_ml_sqm', 'Расход чернил, мл/м²', 'пока нет статистики по бутылкам'],
    ['ink_price_ml_rub', 'Закупка чернил с сольвентом, ₽/мл'],
    ['tax_usn_pct', 'Налог УСН, %'],
    ['draft_idle_minutes', 'Новый черновик после простоя, мин'],
  ]],
];

const SECS = [['printers', 'Оборудование'], ['calc', 'Калькулятор'], ['poly', 'Полиграфия'], ['disc', 'Скидки и срочность'], ['goods', 'Прочие материалы'],
  ['options', 'Постпечать'], ['works', 'Работы и ставки'], ['kits', 'Комплекты'], ['methods', 'Оплата'], ['staff', 'Сотрудники'], ['log', 'История']];
let cur = 'printers';
// Подвкладки «Настройки»: общие и по направлениям (владелец 2026-10-26)
const GROUPS = [['general', 'Общие', ['disc', 'methods', 'staff', 'log']], ['wide', 'Широкоформатная печать', ['printers', 'calc', 'goods', 'options', 'works', 'kits']], ['poly', 'Полиграфия', ['poly']]];
export const settingsGroups = () => GROUPS.filter(([, , keys]) => keys.some(allowed)).map(([k, t]) => [k, t]);
// какая подвкладка открыта: по названию группы или по разделу из старой ссылки (#/settings/printers)
export function settingsGroupOf(arg) {
  const g = settingsGroups();
  if (g.some(([k]) => k === arg)) return arg;
  const byKey = GROUPS.find(([k, , keys]) => keys.includes(arg) && g.some(([x]) => x === k));
  if (byKey) return byKey[0];
  const byCur = GROUPS.find(([k, , keys]) => keys.includes(cur) && g.some(([x]) => x === k));
  return byCur ? byCur[0] : g[0]?.[0];
}

const allowed = (key) => {
  if (['staff', 'log', 'calc', 'disc', 'poly'].includes(key)) return app.me.perm('settings');
  return app.me.perm(TABLES[key].perm);
};

export async function renderSettings(el, arg = null) {
  setTitle('Настройки');
  const grp = settingsGroupOf(arg);
  const keys = GROUPS.find(([k]) => k === grp)?.[2] || [];
  const secs = SECS.filter(([k]) => allowed(k) && keys.includes(k));
  if (arg && secs.find(([k]) => k === arg)) cur = arg;
  if (!secs.find(([k]) => k === cur)) cur = secs[0]?.[0];
  el.innerHTML = `${secs.length > 1 ? `<div class="card" style="padding:10px"><div class="seg" id="secs" style="flex-wrap:wrap">${secs.map(([k, t]) => `<button data-s="${k}" class="${k === cur ? 'on' : ''}">${t}</button>`).join('')}</div></div>` : ''}<div id="sec"></div>`;
  $$('#secs button').forEach((b) => b.addEventListener('click', () => { cur = b.dataset.s; history.replaceState(null, '', '#/settings/' + grp); renderSettings(el, grp); }));
  const box = $('#sec');
  try {
    if (TABLES[cur]) await drawTable(box, TABLES[cur]);
    else if (cur === 'calc') drawCalc(box);
    else if (cur === 'poly') drawPoly(box);
    else if (cur === 'disc') drawDisc(box);
    else if (cur === 'staff') await drawStaff(box);
    else if (cur === 'log') await drawLog(box);
  } catch (e) { box.innerHTML = `<div class="alert bad">${esc(errText(e))}</div>`; }
}

const reloadRefs = async () => { app.refs = await app.api.refs(); };

// ---------- таблица: список карточек + форма ----------
async function drawTable(box, def) {
  const rows = await app.api.list(def.table, def.order);
  box.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><div><h2 style="margin:0">${def.title}</h2><div class="muted small">${def.sub}</div></div><button class="btn primary" id="add">+ Добавить</button></div></div>
    <div class="olist">${rows.map((r, i) => `<div class="ocard" style="cursor:pointer" data-i="${i}"><div>${def.card(r)}</div><div class="sum"><span class="btn sm">Изменить</span></div></div>`).join('') || '<div class="card muted">Пока пусто</div>'}</div>`;
  $('#add').addEventListener('click', () => editRow(def, null, () => drawTable(box, def)));
  $$('#sec [data-i]').forEach((d) => d.addEventListener('click', () => editRow(def, rows[d.dataset.i], () => drawTable(box, def))));
}

function fieldHtml([key, label, type, hint, opts, flags = {}], row) {
  const v = row ? row[key] : undefined;
  const id = 'f_' + key;
  if (type === 'preview') return '<div class="alert ok" id="pv" style="display:none"></div>';
  if (type === 'widths') return row?.cost_basis ? `<div class="field"><label>${esc(label)}</label>${widthsTable(row.cost_basis)}</div>` : '';
  const help = hint ? `<div class="muted small">${esc(hint)}</div>` : '';
  if (type === 'bool') return `<div><label class="toggle ${v ?? true ? 'on' : ''}" data-bool="${key}" style="margin-top:6px"><span class="sw"></span>${esc(label)}</label>${help}</div>`;
  if (type === 'select') return `<div class="field"><label>${esc(label)}</label><select id="${id}">${Object.entries(opts).map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${help}</div>`;
  if (type === 'category') return `<div class="field"><label>${esc(label)}</label><select id="${id}">${app.refs.categories.map((c) => `<option value="${c.id}" ${v === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;
  if (type === 'options' || type === 'kitopts') {
    const on = type === 'options' ? new Set(v || []) : new Set(Object.keys(v || {}));
    return `<div class="field"><label>${esc(label)}</label><div class="row" style="gap:6px">${app.refs.options.filter((o) => o.code !== 'seam_glue').map((o) => `<span class="toggle ${on.has(o.code) ? 'on' : ''}" data-multi="${key}" data-code="${o.code}"><span class="sw"></span>${esc(o.name)}</span>`).join('')}</div>${help}</div>`;
  }
  const ro = flags.createOnly && row ? 'disabled' : '';
  const isNum = type !== 'text';
  return `<div class="field"><label>${esc(label)}</label><input id="${id}" ${isNum ? 'inputmode="decimal" data-num' : ''} value="${esc(v ?? '')}" ${ro}>${help}</div>`;
}

function readForm(m, fields, row, { lenient = false } = {}) {
  const out = {};
  for (const [key, label, type, , , flags = {}] of fields) {
    if (flags.createOnly && row || type === 'preview' || type === 'widths') continue;
    if (type === 'bool') { out[key] = m.querySelector(`[data-bool="${key}"]`).classList.contains('on'); continue; }
    if (type === 'options') { out[key] = [...m.querySelectorAll(`[data-multi="${key}"].on`)].map((t) => t.dataset.code); continue; }
    if (type === 'kitopts') {
      out[key] = Object.fromEntries([...m.querySelectorAll(`[data-multi="${key}"].on`)].map((t) => [t.dataset.code, ['eyelets', 'glue_perimeter'].includes(t.dataset.code) ? { sides: ['top', 'bottom', 'left', 'right'] } : t.dataset.code === 'pocket' ? { sides: ['top'] } : true]));
      continue;
    }
    const el = m.querySelector('#f_' + key);
    const raw = type === 'text' || type === 'select' || type === 'category' ? el.value.trim() : parseIn(el.value.trim());
    if (type === 'text' || type === 'select' || type === 'category') { if (!raw && type === 'text' && !lenient) throw new Error(`заполните «${label}»`); out[key] = raw; continue; }
    if (raw === '') { out[key] = null; continue; }
    const n = Number(raw);
    if ((isNaN(n) || n < 0) && !lenient) throw new Error(`«${label}» — нужно неотрицательное число`);
    out[key] = type === 'int' ? Math.round(n) : n;
  }
  return out;
}

// Редактор материалов услуги постпечати: какой материал и сколько на единицу услуги
const ogRow = (l = {}) => `<div class="row og" style="gap:6px;align-items:flex-end;margin-top:6px">
      <div class="field" style="flex:2"><select class="og-g">${app.refs.goods.map((g) => `<option value="${g.id}" ${l.good_id === g.id ? 'selected' : ''}>${esc(g.name)} (${esc(g.unit)})</option>`).join('')}</select></div>
      <div class="field" style="width:200px"><select class="og-b"><option value="unit" ${l.basis !== 'frame' ? 'selected' : ''}>на единицу услуги</option><option value="frame" ${l.basis === 'frame' ? 'selected' : ''}>на рейку подрамника</option></select></div>
      <div class="field" style="width:90px"><input class="og-q" inputmode="decimal" value="${fmtIn(l.qty_per_unit ?? 1)}" title="количество"></div>
      <button class="btn sm bad og-x" type="button">✕</button></div>`;

function goodsEditorHtml(code) {
  const links = (app.refs.optionGoods || []).filter((l) => l.option_code === code);
  return `<div class="field"><label>Материалы, которые списывает услуга</label><div id="ogList">${links.map(ogRow).join('')}</div>
    <button class="btn sm" type="button" id="ogAdd" style="margin-top:6px">+ материал</button>
    <div class="muted small">Например: «Установка люверсов» — люверс 1 шт на каждый люверс; «Склейка полос» — скотч 1,05 пог. м и клей на 1 пог. м шва.</div></div>`;
}

// init — чем заполнить форму: при «Сделать копию» это поля исходной строки, а сохраняется новая
export function editRow(def, row, done, init = row) {
  const m = modal(`<h3>${row ? 'Изменить' : init ? 'Копия' : 'Добавить'} · ${def.title}</h3>
    <div style="display:flex;flex-direction:column;gap:10px">${def.fields.map((f) => fieldHtml(f, row ? init : { ...init, cost_basis: null })).join('')}
    ${def.goodsEditor ? goodsEditorHtml(row?.code) : ''}
</div>
    <div class="acts">${row && def.deletable ? '<button class="btn bad" id="del">Удалить</button>' : ''}${row && def.copyable ? '<button class="btn" id="copy" style="margin-right:auto">Сделать копию</button>' : ''}<button class="btn" id="cancel">Отмена</button><button class="btn primary" id="save">Сохранить</button></div>`, { wide: true });
  numInputs(m.el);
  m.el.querySelector('#copy')?.addEventListener('click', () => { m.close(); editRow(def, null, done, { ...row, name: row.name + ' (по акции)' }); });
  const refreshPreview = () => {
    if (!def.preview) return;
    const d = readForm(m.el, def.fields, row, { lenient: true });
    const r = def.preview(d, row);
    const t = typeof r === 'string' ? r : r?.t;
    const pv = m.el.querySelector('#pv');
    pv.className = 'alert ' + (r?.kind || 'ok');
    pv.style.display = t ? '' : 'none'; pv.textContent = t || '';
    // в автоматическом режиме цену считает база — поле только для просмотра
    for (const [key, , , , , flags = {}] of def.fields) if (flags.auto) m.el.querySelector('#f_' + key).disabled = d.price_mode === 'auto';
  };
  m.el.querySelectorAll('[data-bool], [data-multi]').forEach((t) => t.addEventListener('click', () => { t.classList.toggle('on'); refreshPreview(); }));
  m.el.querySelectorAll('input, select').forEach((i) => i.addEventListener('input', refreshPreview));
  refreshPreview();
  if (def.goodsEditor) {
    const list = m.el.querySelector('#ogList');
    const bindX = () => list.querySelectorAll('.og-x').forEach((b) => { b.onclick = () => b.closest('.og').remove(); });
    m.el.querySelector('#ogAdd').addEventListener('click', () => { list.insertAdjacentHTML('beforeend', ogRow()); bindX(); });
    bindX();
  }
  m.el.querySelector('#cancel').addEventListener('click', m.close);
  m.el.querySelector('#del')?.addEventListener('click', async () => {
    if (!confirm('Удалить «' + row.name + '»?')) return;
    try { await app.api.deleteRow(def.table, def.id, row[def.id]); m.close(); toast('Удалено'); await reloadRefs(); done(); } catch (e) { toast(errText(e), 'bad'); }
  });
  m.el.querySelector('#save').addEventListener('click', async () => {
    try {
      const data = readForm(m.el, def.fields, row);
      if (def.table === 'printers' && data.side_margin_mm < data.edge_min_mm) throw new Error('защитное поле не может быть меньше технического минимума');
      if (row) await app.api.updateRow(def.table, def.id, row[def.id], data);
      else await app.api.insertRow(def.table, data);
      if (def.goodsEditor) {
        const links = [...m.el.querySelectorAll('#ogList .og')].map((r) => ({ good_id: r.querySelector('.og-g').value, basis: r.querySelector('.og-b').value, qty_per_unit: Number(parseIn(r.querySelector('.og-q').value)) || 1 }));
        await app.api.setOptionGoods(row?.code || data.code, links);
      }
      m.close(); toast('Сохранено'); await reloadRefs(); done();
    } catch (e) { toast(errText(e), 'bad'); }
  });
}

// ---------- калькулятор ----------
function drawCalc(box) {
  const s = app.refs.settings;
  box.innerHTML = CALC_KEYS.map(([title, fields]) => `<div class="card"><h2>${title}</h2><div class="grid2">${fields.map(([k, label, hint]) => `<div class="field"><label>${esc(label)}</label><input data-k="${k}" data-num inputmode="decimal" value="${esc(s[k] ?? '')}">${hint ? `<div class="muted small">${esc(hint)}</div>` : ''}</div>`).join('')}</div></div>`).join('')
    + `<div class="row" style="justify-content:flex-end"><button class="btn primary" id="save">Сохранить</button></div>`;
  numInputs(box);
  $('#save').addEventListener('click', () => saveKeys(box));
}

async function saveKeys(box, extra = {}) {
  try {
    const s = app.refs.settings;
    const pairs = {};
    for (const inp of box.querySelectorAll('[data-k]')) {
      const k = inp.dataset.k, raw = parseIn(inp.value.trim());
      const n = Number(raw);
      if (raw === '' || isNaN(n) || n < 0) throw new Error('нужно неотрицательное число: ' + (inp.closest('.field')?.querySelector('label')?.textContent || inp.closest('tr')?.querySelector('b')?.textContent || inp.dataset.k));
      if (Number(s[k]) !== n) pairs[k] = n;
    }
    Object.assign(pairs, extra);
    if (!Object.keys(pairs).length) return toast('Изменений нет');
    await app.api.setSettings(pairs, app.me.id);
    await reloadRefs();
    toast('Сохранено: ' + Object.keys(pairs).length);
  } catch (e) { toast(errText(e), 'bad'); }
}

// ---------- полиграфия: цены и нормы ризографа, бумаги и переплёта ----------
function drawPoly(box) {
  const s = app.refs.settings;
  box.innerHTML = `<div class="card"><div class="muted small">Из таблицы «PriceList 2», лист «Типография (расчёт)». Помеченное <span class="chip warn nodot">временная</span> — уточнить и поправить. Скидка и срочность — общие, в разделе «Скидки и срочность».</div></div>`
    + POLY_SETTINGS.map(([title, fields]) => `<div class="card"><h2>${esc(title)}</h2><div class="grid2">${fields.map(([k, d, label, temp]) => `<div class="field"><label>${esc(label)}${temp ? ' <span class="chip warn nodot">временная</span>' : ''}</label><input data-k="${POLY_KEY(k)}" data-num inputmode="decimal" value="${esc(s[POLY_KEY(k)] ?? d)}"></div>`).join('')}</div></div>`).join('')
    + `<div class="row" style="justify-content:flex-end"><button class="btn primary" id="save">Сохранить</button></div>`;
  numInputs(box);
  $('#save').addEventListener('click', () => saveKeys(box));
}

// ---------- скидки и срочность ----------
const SPLIT = [['company', 'Компании', '#ffd02b'], ['manager', 'Менеджеру, принявшему заказ', '#3b82f6'], ['print', 'Печатнику', '#8b5cf6'], ['post', 'За постпечать', '#10b981']];

function drawDisc(box) {
  const s = app.refs.settings;
  const sp0 = s.urgency_split || {};
  const split = { company: sp0.company ?? 50, manager: sp0.manager ?? 10, print: sp0.print ?? (sp0.workers != null ? sp0.workers / 2 : 20), post: sp0.post ?? (sp0.workers != null ? sp0.workers / 2 : 20) };
  const inp = (k, unit) => `<div class="row" style="gap:8px;align-items:center;flex-wrap:nowrap"><input data-k="${k}" data-num inputmode="decimal" value="${esc(s[k] ?? '')}" style="max-width:160px"><span class="muted">${unit}</span></div>`;
  box.innerHTML = `
    <div class="card"><h2>Скидка</h2>
      <div class="field" style="max-width:320px"><label>Лимит скидки без подтверждения директора, %</label><input data-k="discount_max_pct" data-num inputmode="decimal" value="${esc(s.discount_max_pct ?? '')}">
      <div class="muted small">Менеджер может дать и больше, но такой заказ не пойдёт в работу, пока директор не подтвердит. Скидка действует на печать и постпечать, на перерасход — никогда.</div></div></div>
    <div class="card"><h2>Срочность</h2>
      <div class="muted small" style="margin-bottom:10px">Клиент доплачивает за срочность процент от суммы заказа, но не меньше минимальной суммы. На срочном заказе скидка не действует.</div>
      <table class="t"><thead><tr><th>Срочность</th><th>Доплата, % от заказа</th><th>Но не меньше, ₽</th></tr></thead><tbody>
        <tr><td><b>Экспресс</b><div class="muted small">в течение дня</div></td><td>${inp('urgency_express_pct', '%')}</td><td>${inp('urgency_express_min', '₽')}</td></tr>
        <tr><td><b>Срочно</b><div class="muted small">в течение 3 часов</div></td><td>${inp('urgency_urgent_pct', '%')}</td><td>${inp('urgency_urgent_min', '₽')}</td></tr>
      </tbody></table></div>
    <div class="card"><h2>Как делится доплата за срочность</h2>
      <div class="muted small" style="margin-bottom:12px">Пример: доплата 1 000 ₽ при делении 50 / 10 / 20 / 20 — 500 ₽ остаётся компании, 100 ₽ получает менеджер, 200 ₽ печатник и 200 ₽ тот, кто делал постпечать. Если печать и постпечать делал один человек, он получает обе части. Тяните границы на полосе или вводите цифры.</div>
      <div class="splitbar" id="sbar"></div>
      <div class="grid2" style="margin-top:14px" id="sinputs">${SPLIT.map(([k, t, c]) => `<div class="field"><label><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:6px"></i>${t}, %</label><input data-split="${k}" inputmode="decimal" value="${split[k]}"></div>`).join('')}</div>
      <div class="small" id="ssum" style="margin-top:6px"></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="save">Сохранить</button></div>`;
  numInputs(box);

  const bar = $('#sbar');
  const draw = () => {
    let acc = 0;
    bar.innerHTML = SPLIT.map(([k, t, c]) => { const w = split[k]; const seg = `<div class="seg-part" style="left:${acc}%;width:${w}%;background:${c}" title="${t}">${w >= 8 ? `${num(w, 1)}%` : ''}</div>`; acc += w; return seg; }).join('')
      + SPLIT.slice(0, -1).map((_, i) => { const pos = SPLIT.slice(0, i + 1).reduce((a, [k]) => a + split[k], 0); return `<div class="seg-handle" data-h="${i}" style="left:${pos}%"></div>`; }).join('');
    $$('#sinputs [data-split]').forEach((i) => { if (document.activeElement !== i) i.value = num(split[i.dataset.split], 1).replace(/\s/g, ''); });
    const sum = SPLIT.reduce((a, [k]) => a + split[k], 0);
    $('#ssum').innerHTML = Math.abs(sum - 100) < 0.01 ? '<span style="color:var(--ok)">Итого 100%</span>' : `<span style="color:var(--bad)">Итого ${num(sum, 1)}% — должно быть 100%</span>`;
    bar.querySelectorAll('.seg-handle').forEach((h) => h.addEventListener('pointerdown', (e) => startDrag(e, Number(h.dataset.h))));
  };
  // Перетаскивание границы между частями i и i+1: меняются только эти две части
  const startDrag = (e, i) => {
    document.activeElement?.blur(); // иначе поле с фокусом не обновит цифру
    e.preventDefault();
    const rect = bar.getBoundingClientRect();
    const a = SPLIT[i][0], b = SPLIT[i + 1][0];
    const left = SPLIT.slice(0, i).reduce((s0, [k]) => s0 + split[k], 0), pair = split[a] + split[b];
    const move = (ev) => {
      const pos = Math.round(((ev.clientX - rect.left) / rect.width) * 100);
      split[a] = Math.max(0, Math.min(pair, pos - left)); split[b] = pair - split[a];
      draw();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  $$('#sinputs [data-split]').forEach((i) => i.addEventListener('input', () => { const n = Number(parseIn(i.value)); if (!isNaN(n) && n >= 0) { split[i.dataset.split] = n; draw(); } }));
  draw();

  $('#save').addEventListener('click', () => {
    const sum = SPLIT.reduce((a, [k]) => a + split[k], 0);
    if (Math.abs(sum - 100) > 0.01) return toast(`Доплата за срочность должна делиться ровно на 100%, сейчас ${num(sum, 1)}%`, 'bad');
    const same = JSON.stringify(split) === JSON.stringify(s.urgency_split);
    saveKeys(box, same ? {} : { urgency_split: { ...split } });
  });
}

// ---------- сотрудники ----------
async function drawStaff(box) {
  const [people, rolePerms] = await Promise.all([app.api.list('profiles', 'full_name'), app.api.list('role_perms').catch(() => [])]);
  const byRole = (role, k) => role === 'director' || rolePerms.some((r) => r.role === role && r.perm === k);
  const countPerms = (p) => PERMS.filter(([k]) => (k in (p.perms || {}) ? p.perms[k] : byRole(p.role, k))).length;
  box.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><div><h2 style="margin:0">Сотрудники</h2><div class="muted small">Роль задаёт права по умолчанию, отдельные права можно переопределить.</div></div><button class="btn primary" id="add">+ Сотрудник</button></div></div>
    <div class="olist">${people.map((p, i) => `<div class="ocard" style="cursor:pointer" data-i="${i}"><div>${esc(p.full_name)} <span class="chip nodot">${ROLE[p.role]}</span>${p.active === false ? ' <span class="chip bad nodot">не работает</span>' : ''}<div class="muted small">${esc(p.phone || '')}${p.phone ? ' · ' : ''}прав: ${countPerms(p)} из ${PERMS.length}${Object.keys(p.perms || {}).length ? ` (своих настроек: ${Object.keys(p.perms).length})` : ''}</div></div><div class="sum"><span class="btn sm">Изменить</span></div></div>`).join('')}</div>`;
  $('#add').addEventListener('click', () => {
    const m = modal(`<h3>Новый сотрудник</h3>
      <div class="field"><label>Имя и фамилия</label><input id="n"></div>
      <div class="field" style="margin-top:8px"><label>Роль</label><select id="r">${Object.entries(ROLE).filter(([k]) => k !== 'director').map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
      <div class="field" style="margin-top:8px"><label>Телефон</label><input id="ph" inputmode="tel"></div>
      <div class="field" style="margin-top:8px"><label>Почта для входа</label><input id="e" type="email"></div>
      <div class="field" style="margin-top:8px"><label>Временный пароль (не короче 8 знаков)</label><input id="pw" type="text" autocomplete="off"></div>
      <div class="muted small" style="margin-top:6px">Сотрудник войдёт с этой почтой и паролем. Пароль передайте ему лично. Права по роли можно уточнить после создания.</div>
      <div class="acts"><button class="btn" id="c">Отмена</button><button class="btn primary" id="s">Создать</button></div>`);
    m.el.querySelector('#c').addEventListener('click', m.close);
    m.el.querySelector('#s').addEventListener('click', async () => {
      const g = (id) => m.el.querySelector('#' + id).value.trim();
      if (!g('n') || !g('e') || g('pw').length < 8) return toast('Заполните имя, почту и пароль от 8 знаков', 'bad');
      try { await app.api.createEmployee({ full_name: g('n'), role: g('r'), phone: g('ph'), email: g('e'), password: g('pw') }); m.close(); toast('Сотрудник создан'); drawStaff(box); }
      catch (e) { toast(errText(e), 'bad'); }
    });
  });
  $$('#sec [data-i]').forEach((d) => d.addEventListener('click', () => editPerson(people[d.dataset.i], byRole, () => drawStaff(box))));
}

function editPerson(p, byRole, done) {
  const isMe = p.id === app.me.id;
  const perms = p.perms || {};
  const m = modal(`<h3>${esc(p.full_name)}</h3>
    <div class="field"><label>Имя и фамилия</label><input id="n" value="${esc(p.full_name)}"></div>
    <div class="field" style="margin-top:8px"><label>Роль</label><select id="r" ${isMe ? 'disabled' : ''}>${Object.entries(ROLE).map(([k, t]) => `<option value="${k}" ${p.role === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field" style="margin-top:8px"><label>Телефон</label><input id="ph" value="${esc(p.phone || '')}"></div>
    <div class="row" style="margin-top:8px"><label class="toggle ${p.piece_rate !== false ? 'on' : ''}" data-t="piece"><span class="sw"></span>Сдельная оплата</label>
      ${isMe ? '' : `<label class="toggle ${p.active !== false ? 'on' : ''}" data-t="active"><span class="sw"></span>Работает</label>`}</div>
    <h3 style="margin-top:14px;font-size:15px">Права</h3>
    <div class="muted small">«По роли» — как у всех с этой ролью (в скобках — что это значит сейчас). Директору доступно всё.</div>
    <div id="permRows"></div>
    <div class="acts"><button class="btn" id="c">Отмена</button><button class="btn primary" id="s">Сохранить</button></div>`, { wide: true });
  const drawPerms = () => {
    const role = m.el.querySelector('#r').value;
    m.el.querySelector('#permRows').innerHTML = PERMS.map(([k, t]) => {
      const def = byRole(role, k) ? 'да' : 'нет';
      return `<div class="row" style="justify-content:space-between;align-items:center;margin:4px 0"><span class="small">${esc(t)}</span>
      <select data-p="${k}" class="inp" style="padding:6px 8px"><option value="">по роли (${def})</option><option value="1" ${perms[k] === true ? 'selected' : ''}>да</option><option value="0" ${perms[k] === false ? 'selected' : ''}>нет</option></select></div>`;
    }).join('');
  };
  drawPerms();
  m.el.querySelector('#r').addEventListener('change', () => { m.el.querySelectorAll('[data-p]').forEach((s) => { if (s.value !== '') perms[s.dataset.p] = s.value === '1'; else delete perms[s.dataset.p]; }); drawPerms(); });
  m.el.querySelectorAll('[data-t]').forEach((t) => t.addEventListener('click', () => t.classList.toggle('on')));
  m.el.querySelector('#c').addEventListener('click', m.close);
  m.el.querySelector('#s').addEventListener('click', async () => {
    const np = {};
    m.el.querySelectorAll('[data-p]').forEach((s) => { if (s.value !== '') np[s.dataset.p] = s.value === '1'; });
    const patch = {
      full_name: m.el.querySelector('#n').value.trim() || p.full_name, phone: m.el.querySelector('#ph').value.trim() || null,
      piece_rate: m.el.querySelector('[data-t="piece"]').classList.contains('on'), perms: np,
    };
    if (!isMe) { patch.role = m.el.querySelector('#r').value; patch.active = m.el.querySelector('[data-t="active"]').classList.contains('on'); }
    try { await app.api.updateRow('profiles', 'id', p.id, patch); m.close(); toast('Сохранено'); done(); } catch (e) { toast(errText(e), 'bad'); }
  });
}

// ---------- история ----------
async function drawLog(box) {
  const [log, staff] = await Promise.all([app.api.settingsLog(), app.api.staff().catch(() => [])]);
  const who = (id) => staff.find((s) => s.id === id)?.full_name || '—';
  const fmtv = (v) => (v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', ') : esc(v ?? '—'));
  box.innerHTML = `<div class="card"><h2>История изменений настроек</h2>${log.length ? `<table class="t"><thead><tr><th>Когда</th><th>Кто</th><th>Параметр</th><th>Было → стало</th></tr></thead><tbody>${log.map((l) => `<tr><td class="small">${dt(l.changed_at)}</td><td class="small">${esc(who(l.changed_by))}</td><td class="small">${esc(l.key)}</td><td class="small">${fmtv(l.old_value)} → <b>${fmtv(l.new_value)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="muted">Пока изменений не было</div>'}</div>`;
}
