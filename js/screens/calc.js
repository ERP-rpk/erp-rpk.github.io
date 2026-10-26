// Экран «Новый расчёт»: витрина материалов → конфигуратор → оформление заказа.
import { app, setTitle } from '../app.js?v=f8825c7';
import { $, $$, esc, rub, num, toast, modal, errText, URGENCY } from '../ui.js?v=f8825c7';
import { calcOrder, draftKey, SIDES } from '../calc-core.js?v=f8825c7';
import { makeCtx } from '../calc-ctx.js?v=f8825c7';
import { schemeSvg, layoutText } from '../scheme.js?v=f8825c7';
import { KINDS, kindKey } from './stock.js?v=f8825c7';

// значок вида материала — те же цвета и значки, что на «Складе»
const kindOf = (c) => { const k = KINDS.find((x) => x[0] === kindKey(c)); return { color: k[2], bg: k[3], icon: k[4] }; };
const kindIcon = (k, cls = '') => `<div class="mic ${cls}" style="background:${k.bg};color:${k.color}"><svg viewBox="0 0 24 24">${k.icon}</svg></div>`;

const SIDE_NAME = { top: 'верх', bottom: 'низ', left: 'лево', right: 'право' };
// Допы, которые выбираются галочкой, и их параметры
const OPT_UI = {
  eyelets: { label: 'Установка люверсов', sides: true, step: true },
  glue_perimeter: { label: 'Проклейка периметра', sides: true, excl: true },
  pocket: { label: 'Карман под трубу', sides: true, excl: true },
  trim: { label: 'Обрезка в размер', excl: true },
  mount: { label: 'Накатка на поверхность клиента' },
  mount_pvc: { label: 'Накатка на ПВХ 3 мм' },
  pvc_cut: { label: 'Резка ПВХ' },
  laminate: { label: 'Холодная ламинация' },
  edge_fold: { label: 'Загиб края' },
  stretcher: { label: 'Натяжка на подрамник (с рейкой)' },
  canvas_edges: { label: 'Обработка краёв холста' },
};
const EXCL = ['glue_perimeter', 'pocket', 'trim'];
const IDLE_MS = 10 * 60 * 1000;

let st = null; // состояние экрана

function freshState() {
  const printers = app.refs.printers;
  return {
    items: [newItem()], cur: 0,
    printerId: printers[0]?.id,
    urgency: 'standard', discountPct: 0, agentMarkupPct: 0, agentDiscountPct: 0,
    draftId: null, lastChange: Date.now(), saveTimer: null, result: null,
  };
}
const newItem = () => ({ widthMm: '', lengthMm: '', qty: 1, frameMm: null, categoryId: null, rollId: null, offcutId: null, options: {} });

const printerRow = () => app.refs.printers.find((p) => p.id === st.printerId) || app.refs.printers[0];
const catRow = (id) => app.refs.categories.find((c) => c.id === id);
const curItem = () => st.items[st.cur];

// Расчёт всего заказа; бросает ошибку ядра с кодом
function compute(items = st.items) {
  const ready = items.filter((i) => i.categoryId && i.widthMm > 0 && i.lengthMm > 0);
  if (!ready.length) return null;
  return calcOrder({
    items: ready.map((i) => ({ ...i, frameMm: i.frameMm ?? undefined })),
    discountPct: st.discountPct, urgency: st.urgency, role: app.me.role,
    agentMarkupPct: st.agentMarkupPct, agentDiscountPct: st.agentDiscountPct,
  }, { item: (it) => makeCtx(app.refs, catRow(it.categoryId), printerRow()), settings: makeCtx(app.refs, app.refs.categories[0], printerRow()).settings });
}

export async function renderCalc(el) {
  setTitle('Новый расчёт');
  if (!st) st = freshState();
  if (!app.refs.printers.length) { el.innerHTML = '<div class="alert bad">Нет активного принтера. Директору — добавить принтер в настройках.</div>'; return; }
  el.innerHTML = `<div class="calc calc2"><div id="left"></div><div id="right"></div></div><div class="cbar" id="cbar"></div>`;
  drawLeft();
  drawRight();
}

// ---------------------------------------------------------------- левая колонка: позиции, размер, витрина
function drawLeft() {
  const it = curItem();
  const kits = app.refs.kits;
  const printers = app.refs.printers;
  $('#left').innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
        <h2 style="margin:0">Позиция ${st.cur + 1}${st.items.length > 1 ? ` из ${st.items.length}` : ''}</h2>
        <div class="row" style="gap:6px">
          ${st.items.length > 1 ? st.items.map((_, i) => `<button class="btn sm ${i === st.cur ? 'dark' : ''}" data-pos="${i}">${i + 1}</button>`).join('') : ''}
          <button class="btn sm" id="addPos">+ позиция</button>
          ${st.items.length > 1 ? '<button class="btn sm bad" id="delPos">Убрать</button>' : ''}
        </div>
      </div>
      ${kits.length ? `<div class="field" style="margin-bottom:10px"><label>Комплект</label><select id="kit"><option value="">— ввести вручную —</option>${kits.map((k) => `<option value="${k.id}">${esc(k.name)}</option>`).join('')}</select></div>` : ''}
      <div class="row csize">
        <div class="field"><label for="w">Ширина, мм</label><input id="w" inputmode="numeric" value="${it.widthMm || ''}" placeholder="3000"></div>
        <div class="times">×</div>
        <div class="field"><label for="l">Длина, мм</label><input id="l" inputmode="numeric" value="${it.lengthMm || ''}" placeholder="2000"></div>
        <div class="field sm"><label for="q">Кол-во</label><input id="q" inputmode="numeric" value="${it.qty}"></div>
        <div class="field md"><label for="fr">Белое поле, мм</label><input id="fr" inputmode="numeric" value="${it.frameMm ?? ''}" placeholder="по материалу"></div>
        <div class="sizeinfo" id="sizeinfo"></div>
      </div>
      ${printers.length > 1 ? `<div class="field" style="margin-top:10px"><label>Принтер</label><select id="pr">${printers.map((p) => `<option value="${p.id}" ${p.id === st.printerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>` : ''}
    </div>
    <div class="row" style="justify-content:space-between;align-items:baseline;margin:16px 0 2px"><h2 style="margin:0;font-size:17px">Материал</h2><span class="muted small">Цена уже посчитана по самому подходящему рулону</span></div>
    <div id="showcase"></div>`;

  const numIn = (id, key, opt = {}) => $('#' + id)?.addEventListener('input', (e) => {
    const v = e.target.value.replace(',', '.').trim();
    // пустое поле: своё значение по умолчанию (для белого поля — null, то есть «как у материала»)
    const val = v === '' ? ('empty' in opt ? opt.empty : '') : Number(v);
    curItem()[key] = isNaN(val) ? '' : val;
    changed();
  });
  numIn('w', 'widthMm'); numIn('l', 'lengthMm'); numIn('q', 'qty', { empty: 1 }); numIn('fr', 'frameMm', { empty: null });
  $('#pr')?.addEventListener('change', (e) => { st.printerId = e.target.value; changed(); });
  $('#kit')?.addEventListener('change', (e) => {
    const k = kits.find((x) => x.id === e.target.value);
    if (!k) return;
    Object.assign(curItem(), { widthMm: k.width_mm, lengthMm: k.length_mm, qty: k.qty, frameMm: k.frame_mm, categoryId: k.category_id, options: structuredClone(k.options || {}), rollId: null });
    drawLeft(); changed();
  });
  $('#addPos').addEventListener('click', () => { st.items.push(newItem()); st.cur = st.items.length - 1; drawLeft(); changed(); });
  $('#delPos')?.addEventListener('click', () => { st.items.splice(st.cur, 1); st.cur = Math.max(0, st.cur - 1); drawLeft(); changed(); });
  $$('[data-pos]').forEach((b) => b.addEventListener('click', () => { st.cur = Number(b.dataset.pos); drawLeft(); drawRight(); }));
  drawShowcase();
}

// Остаток материала выбранного рулона: «в наличии» или «заканчивается» (как на «Складе»)
function stockChip(roll) {
  if (!roll) return '';
  const m = app.refs.materials.find((x) => x.id === roll.materialId);
  const left = app.refs.rolls.filter((r) => r.material_id === roll.materialId).reduce((a, r) => a + Number(r.length_left_mm || 0), 0);
  const low = m?.low_stock_mm != null && left < m.low_stock_mm;
  return `<span class="chip ${low ? 'warn' : 'ok'} nodot">${low ? 'заканчивается' : 'в наличии'} · ${num(left / 1000, 1)} м</span>`;
}

// Витрина: плитки по видам, как на «Складе»; внутри вида — по алфавиту. Без сортировки по цене (решение владельца).
// Цена плитки — та же, что считает ядро (calcOrder). Ничего не сохраняет.
function drawShowcase() {
  const it = curItem();
  const box = $('#showcase');
  const w = Number(it.widthMm) || 0, l = Number(it.lengthMm) || 0;
  $('#sizeinfo').innerHTML = w > 0 && l > 0 ? `<div class="muted small">Площадь</div><b>${num(w * l / 1e6 * (Number(it.qty) || 1), 2)} м²</b>` : '';
  if (!(w > 0 && l > 0)) { box.innerHTML = '<div class="cempty">Введите ширину и длину — система посчитает цену на каждом материале.</div>'; return; }
  const rows = app.refs.categories.map((c) => {
    try {
      const r = calcOrder({ items: [{ ...it, categoryId: c.id, options: {}, rollId: null, frameMm: it.frameMm ?? undefined }], role: app.me.role }, { item: () => makeCtx(app.refs, c, printerRow()), settings: makeCtx(app.refs, c, printerRow()).settings });
      const x = r.items[0];
      return { c, total: r.total, perSqm: r.total / x.layout.printedSqm, strips: x.layout.split ? x.layout.strips : 0, roll: x.layout.roll };
    } catch (e) { return { c, err: errText(e) }; }
  });
  const ok = rows.filter((r) => !r.err), bad = rows.filter((r) => r.err);
  const tile = (r) => `<button class="mtile2 ${it.categoryId === r.c.id ? 'sel' : ''}" data-cat="${r.c.id}">
      <div class="mtop">${kindIcon(kindOf(r.c))}<div class="name">${esc(r.c.name)}</div></div>
      <div><div class="price">${rub(r.total)}</div><div class="sqm">${rub(r.perSqm)} за м²</div></div>
      <div class="chips">${r.strips ? `<span class="chip warn nodot">раскрой на ${r.strips} ${r.strips < 5 ? 'полосы' : 'полос'}</span>` : ''}${stockChip(r.roll)}</div></button>`;
  box.innerHTML = KINDS.map(([k, name, color, bg]) => {
    const g = ok.filter((r) => kindKey(r.c) === k).sort((a, b) => a.c.name.localeCompare(b.c.name, 'ru'));
    if (!g.length) return '';
    return `<div class="mgroup" style="color:${color}">${kindIcon({ bg, color, icon: KINDS.find((x) => x[0] === k)[4] }, 'sm')}${name}<span class="gline" style="background:${bg}"></span></div><div class="mtiles2">${g.map(tile).join('')}</div>`;
  }).join('') + (bad.length ? `<details class="na"><summary>Не подходят для этого размера: ${bad.length}</summary>${bad.map((r) => `<div><span>${esc(r.c.name)}</span><span class="muted">${esc(r.err)}</span></div>`).join('')}</details>` : '');
  $$('#showcase [data-cat]').forEach((t) => t.addEventListener('click', () => {
    const it2 = curItem();
    if (it2.categoryId !== t.dataset.cat) { it2.categoryId = t.dataset.cat; it2.options = {}; it2.rollId = null; it2.offcutId = null; }
    drawShowcase(); changed();
    if (window.innerWidth <= 860) $('#right').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

// ---------------------------------------------------------------- правая панель: обработка, рулон, срочность, итог, схема
// Группы допов в панели (решение владельца 2026-10-26); правила совместимости — прежние (EXCL)
const OPT_GROUPS = [['Края', ['eyelets', 'glue_perimeter', 'pocket', 'trim', 'edge_fold', 'canvas_edges']], ['Поверхность', ['laminate']], ['Монтаж', ['mount', 'mount_pvc', 'pvc_cut', 'stretcher']]];
const optDefault = (k) => (OPT_UI[k]?.sides ? { sides: k === 'pocket' ? ['top'] : [...SIDES] } : true);

// доплата за доп: включённый — из расчёта; выключенный — сколько добавит, если включить
function optPrice(it, x, k) {
  if (x.options[k]) return x.options[k].sum;
  try {
    const opts = Object.fromEntries(Object.entries(it.options).filter(([kk]) => !(EXCL.includes(k) && EXCL.includes(kk))));
    const r = compute([{ ...it, options: { ...opts, [k]: optDefault(k) } }]);
    return r ? r.items[0].sumPost - Object.entries(x.options).filter(([kk]) => !(EXCL.includes(k) && EXCL.includes(kk))).reduce((a, [, v]) => a + v.sum, 0) : null;
  } catch { return null; }
}

function configHtml(it, x, c, ctx) {
  const opts = it.options;
  const activeExcl = EXCL.find((k) => opts[k]);
  const allowed = (c.allowed_options || []).filter((k) => OPT_UI[k]);
  const needSplit = x.layout.needSplit;
  const raskroy = c.split_allowed ? (needSplit
    ? `<div class="rollrow warn"><span>Макет шире рулона: раскрой на ${x.layout.strips} полосы, обязателен</span><span class="toggle on locked" data-opt="raskroy"><span class="sw"></span>Раскрой</span></div>`
    : `<div class="rollrow"><span>Раскрой ради экономии материала</span><span class="toggle ${opts.raskroy ? 'on' : ''}" data-opt="raskroy"><span class="sw"></span>Раскрой</span></div>`) : '';
  const groups = OPT_GROUPS.map(([g, keys]) => {
    const ks = keys.filter((k) => allowed.includes(k));
    if (!ks.length) return '';
    return `<div class="grp"><div class="gl">${g}</div><div class="opts">${ks.map((k) => {
      const on = !!opts[k], dis = OPT_UI[k].excl && activeExcl && activeExcl !== k, p = optPrice(it, x, k);
      return `<button class="opt ${on ? 'on' : ''} ${dis ? 'dis' : ''}" data-opt="${k}" ${dis ? 'title="Нельзя вместе с другим вариантом обработки края"' : ''}><span>${OPT_UI[k].label}</span><span class="pp">${p == null ? '' : (on ? 'включено · ' : '+ ') + rub(p)}</span></button>`;
    }).join('')}</div>
      ${ks.filter((k) => opts[k] && (OPT_UI[k].sides || OPT_UI[k].step)).map((k) => `<div class="sidesrow"><span>${OPT_UI[k].label}:</span>
        ${OPT_UI[k].step ? `<label class="small">шаг, мм <input data-step="${k}" inputmode="numeric" value="${opts[k].step ?? ctx.settings.eyeletStepMm}" style="width:70px"></label>` : ''}
        ${OPT_UI[k].sides ? `<div class="sides">${SIDES.map((s) => `<button data-side="${k}|${s}" class="${(opts[k].sides || (k === 'pocket' ? [] : SIDES)).includes(s) ? 'on' : ''}">${SIDE_NAME[s]}</button>`).join('')}</div>` : ''}</div>`).join('')}</div>`;
  }).join('');
  const roll = ctx.rolls.length
    ? `<div class="rollrow"><span>Рулон</span><select id="roll"><option value="">Автоматически${x.layout.roll ? ` · ${esc(x.layout.roll.article || '')}` : ''}</option>${ctx.rolls.map((r) => `<option value="${r.id}" ${it.rollId === r.id ? 'selected' : ''}>${esc(r.article)} · ${num(r.widthMm / 1000, 2)} м · остаток ${num(r.leftMm / 1000, 1)} м</option>`).join('')}</select></div>`
    : '<div class="alert bad">На складе нет рулонов этой категории (E03)</div>';
  return `<div id="cfg">${raskroy}${groups}${roll}</div>`;
}

function drawRight() {
  const box = $('#right');
  const fa = document.activeElement, fid = fa && box.contains(fa) && fa.id, fsel = fid && fa.selectionStart;
  let r = null, err = null;
  try { r = compute(); } catch (e) { err = errText(e); }
  st.result = r;
  const it = curItem();
  const c = it.categoryId && catRow(it.categoryId);
  const cbar = $('#cbar');
  if (err) { box.innerHTML = `<div class="card"><div class="alert bad">${esc(err)}</div></div>`; if (cbar) cbar.innerHTML = ''; return; }
  if (!r || !c || !(it.widthMm > 0 && it.lengthMm > 0)) {
    box.innerHTML = `<div class="card cpanel"><div class="steps3"><div class="${it.widthMm > 0 && it.lengthMm > 0 ? 'done' : 'cur'}"><b>1</b>Введите размер</div><div class="${it.widthMm > 0 && it.lengthMm > 0 ? 'cur' : ''}"><b>2</b>Выберите материал</div><div><b>3</b>Настройте обработку</div></div>
      <div class="muted small" style="text-align:center;margin-top:10px">Здесь появятся обработка, итоговая цена и схема раскроя.</div></div>`;
    if (cbar) cbar.innerHTML = '';
    return;
  }
  const seeCost = app.me.perm('see_cost');
  const isDir = app.me.role === 'director', isAgent = app.me.role === 'agent';
  const canDiscount = app.me.perm('give_discount') && !isAgent;
  const idx = st.items.filter((i) => i.categoryId && i.widthMm > 0 && i.lengthMm > 0).indexOf(it);
  const x = r.items[Math.max(0, idx)];
  const ctx = makeCtx(app.refs, c, printerRow());
  const pr = ctx.printer;
  const L = x.layout;
  const svg = schemeSvg({ ...x, qty: it.qty }, pr);
  const mini = svg.slice(0, svg.indexOf('</svg>') + 6);
  const wastePct = L.usedSqm ? Math.round(L.wasteSqm / L.usedSqm * 100) : 0;
  const optLines = Object.entries(x.options).map(([k, v]) => {
    const mats = (v.materials || []).filter((m) => m.qty).map((m) => `${esc(m.name)} ${num(m.qty)} ${esc(m.unit || '')}`).join(', ');
    return `<div class="total-line small"><span>${esc(OPT_UI[k]?.label || app.refs.options.find((o) => o.code === k)?.name || k)} · ${num(v.qty)}${v.sum === v.min && v.min ? ' (минимум)' : ''}${mats ? `<div class="muted">в т. ч. ${mats}</div>` : ''}</span><span>${rub(v.sum)}</span></div>`;
  }).join('');
  const printedAll = r.items.reduce((a, y) => a + y.layout.printedSqm, 0);
  box.innerHTML = `
    <div class="card cpanel">
      <div class="selhead">${kindIcon(kindOf(c))}<div style="min-width:0"><div class="nm">${esc(c.name)}</div><div class="muted small">${num(it.widthMm, 0)}×${num(it.lengthMm, 0)} мм · ${it.qty} шт${st.items.length > 1 ? ` · позиция ${st.cur + 1}` : ''}</div></div></div>
      <button class="schemebox" id="schemeBtn" title="Нажмите, чтобы увеличить">${mini}<div class="sinfo"><div class="gl">Схема раскроя</div>
        <div class="small">Рулон ${num(L.rollWidthMm / 1000, 2)} м · расход <b>${num(L.rollLengthMm / 1000, 2)} пог. м</b></div>
        <div class="small">Перерасход <b>${num(L.wasteSqm, 2)} м²</b> <span class="chip ${wastePct > 30 ? 'warn' : 'ok'} nodot">${wastePct}%</span></div>
        <span class="link">Увеличить</span></div></button>
      ${configHtml(it, x, c, ctx)}
      <div class="grp"><div class="gl">Срочность</div><div class="seg urg" id="urg">${Object.entries(URGENCY).map(([k, t]) => `<button data-u="${k}" class="${k} ${st.urgency === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="muted small" style="margin-top:6px">Экспресс — в течение дня, Срочно — в течение 3 часов. Срочность обнуляет скидку.</div></div>
      ${canDiscount ? `<div class="row" style="margin-top:12px;align-items:center"><div class="field" style="width:140px"><label for="disc">Скидка, %</label><input id="disc" inputmode="decimal" value="${st.discountPct || ''}" ${st.urgency !== 'standard' ? 'disabled' : ''}></div><div id="discWarn" class="small"></div></div>` : ''}
      ${isAgent ? `<div class="row" style="margin-top:12px">
        <div class="field" style="width:150px"><label for="amk">Моя наценка, %</label><input id="amk" inputmode="decimal" value="${st.agentMarkupPct || ''}"></div>
        <div class="field" style="width:150px"><label for="adc">Скидка клиенту, %</label><input id="adc" inputmode="decimal" value="${st.agentDiscountPct || ''}"></div></div>` : ''}
      <div class="csum">
        <div class="muted small" style="font-weight:700">Итого${st.items.length > 1 ? ` за ${st.items.length} позиции` : ''}</div>
        <div class="big" id="total">${rub(r.total)}</div><div class="muted small">${rub(r.total / printedAll)} за м²</div>
        ${r.agent ? `<div class="total-line"><span>Цена для вашего клиента</span><b>${rub(r.agent.price)}</b></div><div class="total-line"><span>Со скидкой клиенту</span><b>${rub(r.agent.priceWithDiscount)}</b></div>` : ''}
        <details class="fold" id="fold"><summary><span>Из чего складывается цена</span><span class="muted">▾</span></summary>
          <div class="total-line"><span>Печать</span><span>${rub(r.sumPrint)}</span></div>
          ${optLines}
          <div class="total-line"><span>Перерасход материала</span><span>${rub(r.sumWaste)}</span></div>
          ${r.sumDiscount ? `<div class="total-line"><span>Скидка ${num(r.discountPct)}%</span><span>−${rub(r.sumDiscount)}</span></div>` : ''}
          ${r.sumUrgency ? `<div class="total-line"><span>Срочность · ${URGENCY[st.urgency]}</span><span>+${rub(r.sumUrgency)}</span></div>` : ''}
          ${seeCost ? `<div class="total-line small muted"><span>Себестоимость · налог</span><span>${rub(r.cost)} · ${rub(r.tax)}</span></div><div class="total-line small"><span>Маржа</span><b style="color:${r.margin < 0 ? 'var(--bad)' : 'var(--ok)'}">${rub(r.margin)}</b></div>` : ''}
        </details>
        ${r.approvals.length && !isDir ? `<div class="alert">${r.approvals.includes('discount_over_limit') ? 'Скидка выше лимита — ' : 'Заказ в минус — '}заказ создастся, но дальше пойдёт после подтверждения директора</div>` : ''}
        <div class="row" style="margin-top:14px;flex-wrap:nowrap"><button class="btn" id="reset">Сбросить</button><button class="btn primary" id="place" style="flex:1">Оформить заказ</button></div>
        <div class="muted small" style="margin-top:6px" id="draftInfo">${st.draftId ? 'Черновик сохранён' : ''}</div>
      </div>
    </div>
    ${offcutBlock(x)}`;
  if (cbar) cbar.innerHTML = `<div><div class="muted small" style="font-weight:700">Итого</div><div class="t">${rub(r.total)}</div></div><button class="btn primary" id="place2">Оформить заказ</button>`;
  $('#fold').open = !!st.foldOpen;
  $('#fold').addEventListener('toggle', (e) => { st.foldOpen = e.target.open; });
  $('#schemeBtn').addEventListener('click', () => {
    const m = modal(`<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Схема раскроя · ${esc(c.name)}</h3><button class="btn" id="sx">Закрыть</button></div>
      <div class="muted small" style="margin:4px 0 10px">${layoutText(L)}${L.roll ? ` · рулон ${esc(L.roll.article || '')}` : ''}</div>
      <div class="bigscheme">${svg}</div>
      <div class="row small" style="margin-top:10px;gap:18px"><span>Расход <b>${num(L.usedSqm)} м²</b></span><span>Полезная <b>${num(L.printedSqm)} м²</b></span><span>Перерасход <b>${num(L.wasteSqm)} м²</b> (${wastePct}%)</span></div>`, { wide: true });
    m.el.querySelector('#sx').addEventListener('click', m.close);
  });
  // обработка
  const opts = it.options;
  $$('#cfg [data-opt]').forEach((t) => t.addEventListener('click', () => {
    const k = t.dataset.opt;
    if (t.classList.contains('locked') || t.classList.contains('dis')) return;
    if (opts[k]) delete opts[k];
    else opts[k] = k === 'raskroy' ? true : optDefault(k);
    changed();
  }));
  $$('#cfg [data-side]').forEach((b) => b.addEventListener('click', () => {
    const [k, s] = b.dataset.side.split('|');
    const cur = new Set(opts[k].sides || SIDES);
    cur.has(s) ? cur.delete(s) : cur.add(s);
    if (!cur.size) return toast('Нужна хотя бы одна сторона');
    opts[k].sides = SIDES.filter((y) => cur.has(y));
    changed();
  }));
  $$('#cfg [data-step]').forEach((inp, i) => { inp.id = 'step' + i; }); $$('#cfg [data-step]').forEach((inp) => inp.addEventListener('input', () => { opts[inp.dataset.step].step = Number(inp.value) || undefined; changed(); }));
  $('#roll')?.addEventListener('change', (e) => { it.rollId = e.target.value || null; changed(); });
  // срочность, скидка, агент
  $$('#urg button').forEach((b) => b.addEventListener('click', () => { st.urgency = b.dataset.u; changed(); }));
  const stIn = (id, key) => $('#' + id)?.addEventListener('input', (e) => { const v = Number(e.target.value.replace(',', '.').trim()); st[key] = isNaN(v) ? 0 : v; changed(); });
  stIn('disc', 'discountPct'); stIn('amk', 'agentMarkupPct'); stIn('adc', 'agentDiscountPct');
  $('#reset').addEventListener('click', () => { st = freshState(); renderCalc($('#screen')); });
  $$('#right [data-offcut]').forEach((b) => b.addEventListener('click', () => {
    it.offcutId = it.offcutId === b.dataset.offcut ? null : b.dataset.offcut;
    changed();
  }));
  $('#place').addEventListener('click', placeDialog);
  $('#place2')?.addEventListener('click', placeDialog);
  const dw = $('#discWarn');
  if (dw) dw.innerHTML = !isDir && st.discountPct > ctx.settings.discountMaxPct ? '<span style="color:var(--bad);font-weight:700">Выше лимита — нужно подтверждение директора</span>' : '';
  if (fid && $('#' + fid)) { const f = $('#' + fid); f.focus(); try { f.setSelectionRange(fsel, fsel); } catch { /* не текстовое поле */ } }
}

// Подходящие обрезки: менеджер решает сам, печатать ли на обрезке. Цена клиенту та же, рулон не тратится.
function offcutBlock(x) {
  const it = curItem();
  if (it.offcutId && !x.offcut) it.offcutId = null; // обрезок больше не подходит (поменяли размер) или его уже забрали
  if (!x.offcutFits?.length) return '';
  return `<div class="card"><h2>Подходит обрезок</h2>
    <div class="muted small" style="margin-bottom:8px">Позиция целиком помещается в обрезок со склада. Цена для клиента не меняется, рулон не тратится.</div>
    ${x.offcutFits.slice(0, 3).map((o) => `<div class="row" style="justify-content:space-between;align-items:center;gap:10px;margin-top:6px">
      <span><b>${num(o.widthMm, 0)} × ${num(o.lengthMm, 0)} мм</b> <span class="muted small">из рулона <span class="mono">${esc(o.article)}</span></span></span>
      <button class="btn sm ${it.offcutId === o.id ? 'primary' : ''}" data-offcut="${o.id}">${it.offcutId === o.id ? '✓ Печатаем на нём' : 'Печатать на обрезке'}</button></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- черновик
function changed() {
  if (Date.now() - st.lastChange > IDLE_MS) st.draftId = null; // после 10 минут простоя — новый черновик
  st.lastChange = Date.now();
  drawShowcase();
  drawRight();
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(saveDraft, 1200);
}

function orderRow(r) {
  return {
    manager_id: app.me.id, printer_id: st.printerId, urgency: st.urgency,
    discount_pct: r.discountPct, agent_markup_pct: st.agentMarkupPct || 0, agent_discount_pct: st.agentDiscountPct || 0,
    sum_print: r.sumPrint, sum_post: r.sumPost, sum_waste: r.sumWaste, sum_discount: r.sumDiscount, sum_urgency: r.sumUrgency,
    total: r.total, cost_total: r.cost, margin: r.margin,
    draft_key: draftKey(Number(curItem().widthMm) || 0, Number(curItem().lengthMm) || 0),
    last_activity_at: new Date().toISOString(),
  };
}
// Целые поля базы: только целые числа (пустая строка или дробь ломает сохранение позиции)
const int = (v) => Math.round(Number(v) || 0);

function itemRows(r) {
  const ready = st.items.filter((i) => i.categoryId && i.widthMm > 0 && i.lengthMm > 0);
  return ready.map((it, k) => {
    const x = r.items[k];
    const roll = x.layout.roll;
    const { roll: _drop, ...layout0 } = x.layout;
    // количество по каждой услуге постпечати — для сдельной оплаты за блок «Постпечать»
    const layout = { ...layout0, optionQty: Object.fromEntries(Object.entries(x.options).map(([k, v]) => [k, v.qty])) };
    const oc = x.offcut;
    return {
      category_id: it.categoryId, material_id: oc?.materialId || roll?.materialId || null, roll_id: oc?.rollId || roll?.id || null,
      offcut_id: oc?.id || null,
      width_mm: int(it.widthMm), length_mm: int(it.lengthMm), qty: Math.max(1, int(it.qty)), frame_mm: int(x.sizes.frameMm),
      options: it.options, layout, roll_length_mm: int(x.layout.rollLengthMm),
      useful_sqm: x.layout.printedSqm, waste_sqm: x.layout.wasteSqm,
      sum_print: x.sumPrint, sum_post: x.sumPost, sum_waste: x.sumWaste, cost: x.cost,
    };
  });
}
// Сохранение черновика. Фоновое — молча пишет статус под кнопкой; при оформлении (strict) ошибка
// прерывает оформление, чтобы заказ не ушёл без позиций.
let saving = Promise.resolve();
function saveDraft({ strict = false } = {}) {
  const run = async () => {
    const r = st.result;
    if (!r) { if (strict) throw new Error('нечего сохранять: нет расчёта'); return; }
    const di = () => $('#draftInfo');
    try {
      const wasNew = !st.draftId;
      st.draftId = await app.api.saveDraft(st.draftId, orderRow(r), itemRows(r));
      if (!wasNew) app.api.addCalcVersion(st.draftId, { items: st.items, urgency: st.urgency, discountPct: st.discountPct, total: r.total }).catch(() => {});
      if (di()) di().textContent = 'Черновик сохранён';
    } catch (e) {
      if (di()) di().innerHTML = `<span style="color:var(--bad)">Черновик не сохранён: ${esc(errText(e))}</span>`;
      if (strict) throw e;
    }
  };
  saving = saving.then(run, run); // сохранения идут по очереди, не накладываются друг на друга
  return saving;
}

// ---------------------------------------------------------------- оформление
function placeDialog() {
  const r = st.result;
  if (!r) return;
  let client = null;
  const m = modal(`<h3>Оформить заказ · ${rub(r.total)}</h3>
    <div class="field"><label>Клиент — поиск по имени или телефону</label><input id="cq" placeholder="Иванов или +7913…" autocomplete="off"></div>
    <div id="cres" style="margin-top:6px"></div>
    <div id="cnew" class="hidden" style="margin-top:10px">
      <div class="row"><div class="field" style="flex:1"><label>Имя / организация</label><input id="cn"></div><div class="field" style="flex:1"><label>Телефон</label><input id="cp" inputmode="tel"></div></div>
      <button class="btn sm" id="csave" style="margin-top:8px">Создать клиента</button>
    </div>
    <div id="csel" class="alert ok hidden"></div>
    <div class="field" style="margin-top:12px"><label>Срок готовности</label><input id="due" type="datetime-local"></div>
    <div id="pay" class="hidden" style="margin-top:12px">
      <div class="field"><label>Способ оплаты</label><div class="seg" id="pm">${app.refs.methods.map((p, i) => `<button data-m="${p.code}" class="${i === 0 ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:8px;width:180px"><label>Сумма, ₽</label><input id="pa" inputmode="decimal" value="${r.total}"></div>
    </div>
    <div class="acts">
      <button class="btn" id="noPay" disabled>Оформить без оплаты</button>
      ${app.me.perm('take_payment') ? '<button class="btn primary" id="withPay" disabled>Принять оплату</button>' : ''}
    </div>`);
  const E = (id) => m.el.querySelector('#' + id);
  const pick = (c) => {
    client = c;
    E('csel').textContent = 'Клиент: ' + c.name + (c.phone ? ' · ' + c.phone : '');
    E('csel').classList.remove('hidden'); E('cres').innerHTML = ''; E('cnew').classList.add('hidden');
    E('noPay').disabled = false; if (E('withPay')) E('withPay').disabled = false;
    E('pay').classList.remove('hidden');
  };
  let t;
  E('cq').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = E('cq').value;
      const list = q.trim().length >= 2 ? await app.api.findClients(q).catch(() => []) : [];
      E('cres').innerHTML = list.map((c, i) => `<div class="toggle" data-ci="${i}" style="margin:3px">${esc(c.name)} <span class="muted small">${esc(c.phone || '')}</span></div>`).join('')
        + (q.trim().length >= 2 ? '<div class="toggle" id="cadd" style="margin:3px">+ Новый клиент</div>' : '');
      m.el.querySelectorAll('[data-ci]').forEach((d) => d.addEventListener('click', () => pick(list[d.dataset.ci])));
      E('cadd')?.addEventListener('click', () => { E('cnew').classList.remove('hidden'); E(/^\+?\d[\d\s()-]+$/.test(q) ? 'cp' : 'cn').value = q; });
    }, 300);
  });
  E('csave').addEventListener('click', async () => {
    const name = E('cn').value.trim();
    if (!name) return toast('Введите имя клиента');
    try { pick(await app.api.createClient({ name, phone: E('cp').value.trim() || null, owner_id: app.me.id })); }
    catch (e) { toast(errText(e), 'bad'); }
  });
  m.el.querySelectorAll('#pm button').forEach((b) => b.addEventListener('click', () => { m.el.querySelectorAll('#pm button').forEach((x) => x.classList.toggle('on', x === b)); }));
  const go = async (withPay) => {
    E('noPay').disabled = true; if (E('withPay')) E('withPay').disabled = true;
    try {
      clearTimeout(st.saveTimer);
      await saveDraft({ strict: true });
      if (!st.draftId) throw new Error('черновик не сохранился');
      const due = E('due').value ? new Date(E('due').value).toISOString() : null;
      const o = await app.api.placeOrder(st.draftId, { client_id: client.id, due_at: due });
      if (withPay) {
        const amount = Number(String(E('pa').value).replace(',', '.'));
        const method = m.el.querySelector('#pm button.on').dataset.m;
        if (amount > 0) await app.api.addPayment(st.draftId, method, amount, app.me.id);
      }
      m.close();
      toast(`Заказ ${o.number} оформлен`);
      const id = st.draftId;
      st = freshState();
      location.hash = '#/order/' + id;
    } catch (e) {
      toast(errText(e), 'bad');
      E('noPay').disabled = false; if (E('withPay')) E('withPay').disabled = false;
    }
  };
  E('noPay').addEventListener('click', () => go(false));
  E('withPay')?.addEventListener('click', () => go(true));
  E('cq').focus();
}
