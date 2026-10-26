// Экран «Склад»: остатки рулонов, приход, инвентаризация, обрезки, журнал движения, чернила.
// Все изменения идут через функции базы (миграция 011): там проверка прав и запись в журнал.
import { app, setTitle } from '../app.js?v=f8825c7';
import { $, $$, esc, num, rub, dt, toast, modal, errText, numInputs, parseIn, roundHint, mmUp, mmDown } from '../ui.js?v=f8825c7';
import { TABLES, editRow } from './settings.js?v=f8825c7';
import { widthsTable, recBlock } from '../price-rec.js?v=f8825c7';

const M = (mm) => num(mm / 1000, 1) + ' м';
const SQM = (r, mm = r.length_left_mm) => (r.width_mm / 1000) * (mm / 1000);
const MOVE = { receipt: 'Приход', consume: 'Расход по заказу', offcut_out: 'Обрезок в работу', offcut_in: 'Обрезок сохранён', writeoff: 'Списание', inventory: 'Инвентаризация', brak: 'Брак', regroup: 'Перенос в другой материал' };
const INK = { C: 'Голубой (C)', M: 'Пурпурный (M)', Y: 'Жёлтый (Y)', K: 'Чёрный (K)', solvent: 'Сольвент' };
const INK_COLOR = { C: '#06b6d4', M: '#db2777', Y: '#eab308', K: '#1a1a1a', solvent: '#94a3b8' };
const today = () => new Date().toLocaleDateString('sv'); // ГГГГ-ММ-ДД по местному времени

const can = {
  view: () => app.me.perm('see_stock') || app.me.perm('stock_in') || app.me.perm('stock_off'),
  in: () => app.me.perm('stock_in'),
  off: () => app.me.perm('stock_off'),
  cost: () => app.me.perm('see_cost'),
  ink: () => app.me.perm('print_work') || app.me.perm('see_cost'),
  offcut: () => app.me.perm('stock_off') || app.me.perm('print_work'),
  move: () => app.me.perm('nomenclature'),
};
const TABS = [['left', 'Материалы', can.view], ['in', 'Приход', can.in], ['inv', 'Инвентаризация', can.off], ['off', 'Обрезки', can.view],
  ['moves', 'Движение', can.view], ['ink', 'Чернила', can.ink]];
let tab = 'left';
let S = null; // данные склада: материалы, рулоны, обрезки

export const canOpenStock = () => TABS.some(([, , f]) => f());

// arg — id печатного материала: открыть его карточку (из уведомления о рекомендации цены)
export async function renderStock(el, arg = null) {
  setTitle('Склад');
  if (arg) { tab = 'left'; openCat = { id: arg, tab: null }; history.replaceState(null, '', '#/stock'); }
  const tabs = TABS.filter(([, , f]) => f());
  if (!tabs.find(([k]) => k === tab)) tab = tabs[0][0];
  el.innerHTML = `<div class="card" style="padding:10px"><div class="seg" id="tabs" style="flex-wrap:wrap">${tabs.map(([k, t]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</div></div><div id="pane"><div class="muted">Загрузка…</div></div>`;
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; renderStock(el); }));
  const pane = $('#pane');
  try {
    if (tab !== 'ink') S = await app.api.stock();
    if (tab === 'left') S.cats = await app.api.list('material_categories', 'name');
    ({ left: drawMaterials, in: drawIn, inv: drawInv, off: drawOffcuts, moves: drawMoves, ink: drawInk })[tab](pane, () => renderStock(el));
  } catch (e) { pane.innerHTML = `<div class="alert bad">${esc(errText(e))}</div>`; }
}

const catOf = (m) => app.refs.categories.find((c) => c.id === m.category_id);
const matOf = (id) => S.materials.find((m) => m.id === id);
const rollName = (r) => matOf(r.material_id)?.name || '—';
const unchecked = (r) => !r.inventory_at;

// ---------- материалы: плитки по видам, карточка раскрывается под плиткой ----------
// Вид материала → цвет и значок плитки (решение владельца 2026-10-25)
export const KINDS = [
  ['banner', 'Баннер', '#185FA5', '#E6F1FB', '<path d="M5 21V4h13l-3 4.5L18 13H5"/>'],
  ['banner_cast', 'Литой баннер', '#0C447C', '#DCEBFA', '<ellipse cx="7" cy="12" rx="3" ry="7"/><path d="M7 5h12v14H7"/>'],
  ['mesh', 'Сетка', '#5F5E5A', '#F1EFE8', '<path d="M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16"/>'],
  ['self_adhesive', 'Самоклейка', '#3B6D11', '#EAF3DE', '<path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/>'],
  ['canvas', 'Холст', '#854F0B', '#FAEEDA', '<rect x="3" y="4" width="18" height="15" rx="1"/><path d="M3 16l5-5 4 4 3-3 6 6"/>'],
  ['photo_paper', 'Бумага', '#534AB7', '#EEEDFE', '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>'],
  ['other', 'Другое', '#44617A', '#E8EEF3', '<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>'],
];
const KIND = Object.fromEntries(KINDS.map(([k, name, color, bg, icon]) => [k, { name, color, bg, icon }]));
const kindOf = (c) => KIND[c.kind] || KIND.other;
export const kindKey = (c) => (KIND[c.kind] ? c.kind : 'other');
const icon = (k) => `<div class="mic" style="background:${k.bg};color:${k.color}"><svg viewBox="0 0 24 24">${k.icon}</svg></div>`;
const W = (mm) => num(mm / 1000, 3) + ' м';
let openCat = null; // { id, tab } — открытая карточка материала, переживает перерисовку
let flt = 'all', showHidden = false;
const seePrice = () => app.me.perm('see_prices') || app.me.perm('see_cost');

// Всё о материале со склада: ширины (все рулоны ширины вместе), рулоны по порядку расхода, обрезки
function stockOf(c) {
  const mats = S.materials.filter((m) => m.category_id === c.id);
  const rolls = S.rolls.filter((r) => r.status === 'active' && mats.some((m) => m.id === r.material_id))
    .sort((a, b) => a.width_mm - b.width_mm || a.purchase_date.localeCompare(b.purchase_date));
  const widths = [...new Set([...mats.map((m) => m.width_mm), ...rolls.map((r) => r.width_mm)])].sort((a, b) => a - b).map((w) => {
    const rs = rolls.filter((r) => r.width_mm === w), m = mats.find((x) => x.width_mm === w);
    const left = rs.reduce((a, r) => a + r.length_left_mm, 0);
    return { w, m, rolls: rs, left, full: rs.reduce((a, r) => a + r.length_initial_mm, 0), low: m?.low_stock_mm != null && left < m.low_stock_mm };
  });
  const offcuts = S.offcuts.filter((o) => rolls.some((r) => r.id === o.roll_id) || S.rolls.some((r) => r.id === o.roll_id && mats.some((m) => m.id === r.material_id)));
  return { mats, rolls, widths, offcuts, cost: rolls.reduce((a, r) => a + (r.cost_sqm ?? 0) * SQM(r), 0) };
}

function drawMaterials(pane, reload) {
  const cats = S.cats.filter((c) => c.active || showHidden);
  const info = new Map(cats.map((c) => [c.id, stockOf(c)]));
  const toCheck = S.rolls.filter((r) => r.status === 'active' && unchecked(r)).length;
  const total = [...info.values()].reduce((a, x) => a + x.cost, 0);
  const recs = seePrice() ? cats.filter((c) => c.rec_at) : [];
  const hidden = S.cats.filter((c) => !c.active).length;
  const tile = (c) => {
    const k = kindOf(c), x = info.get(c.id);
    const chips = [
      ...(c.rec_at && seePrice() ? [`<span class="chip warn nodot">рекомендуем ${rub(c.rec_print_sqm)}</span>`] : []),
      ...(x.rolls.some(unchecked) ? ['<span class="chip warn nodot">не проверен</span>'] : []),
      ...x.widths.map((w) => `<span class="chip ${w.low ? 'warn' : ''} nodot">${W(w.w)} · ${w.rolls.length ? M(w.left) : 'нет'}${w.low ? ' · заканчивается' : ''}</span>`),
    ];
    return `<div class="mtile ${c.active ? '' : 'off'}" data-cat="${c.id}" data-low="${x.widths.some((w) => w.low)}" data-check="${x.rolls.some(unchecked)}">${icon(k)}
      <div style="min-width:0"><b>${esc(c.name)}</b>${c.active ? '' : ' <span class="chip nodot">скрыт</span>'}
        ${seePrice() ? `<div class="mprice">${rub(c.price_print_sqm)}<span class="muted small" style="font-weight:600"> за м²</span></div>` : ''}
        <div class="mchips">${chips.join('') || '<span class="muted small">рулонов нет</span>'}</div></div></div>`;
  };
  pane.innerHTML = `
    ${toCheck ? `<div class="alert">${toCheck} ${toCheck === 1 ? 'рулон перенесён' : 'рулонов перенесено'} из таблицы с полной длиной — остаток нужно проверить${can.off() ? ' на вкладке «Инвентаризация»' : ''}.</div>` : ''}
    <div class="card"><div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div><h2 style="margin:0">Материалы</h2><div class="muted small">Нажмите на материал — под ним откроются остатки, рулоны, цена и настройки.</div></div>
      <div class="row" style="gap:12px;align-items:center">${can.cost() ? `<div style="text-align:right"><div class="muted small">Остаток по закупке</div><b style="font-size:18px">${rub(total)}</b></div>` : ''}
        ${app.me.perm('nomenclature') ? '<button class="btn primary" id="newCat">+ Новый материал</button>' : ''}</div></div>
      <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center"><div class="seg" id="flt"><button data-f="all">Все</button><button data-f="low">Заканчиваются</button><button data-f="check">Не проверены</button></div>
        ${hidden && app.me.perm('nomenclature') ? `<label class="toggle ${showHidden ? 'on' : ''}" id="hid"><span class="sw"></span>Скрытые (${hidden})</label>` : ''}</div>
      ${recs.length ? `<div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap;align-items:center"><span class="small"><b>Рекомендации по цене: ${recs.length}</b></span>${recs.map((c) => `<button class="btn sm" data-rec="${c.id}" style="background:var(--warn-bg);border-color:var(--warn-bg);color:var(--warn)">${esc(c.name)} → ${rub(c.rec_print_sqm)}</button>`).join('')}</div>` : ''}</div>
    <div id="mats">${KINDS.filter(([kk]) => cats.some((c) => (KIND[c.kind] ? c.kind : 'other') === kk)).map(([kk, name, color, bg, ic]) => `
      <div class="mgroup" style="color:${color}"><div class="mic" style="background:${bg};width:28px;height:28px;border-radius:8px"><svg viewBox="0 0 24 24" style="width:16px;height:16px">${ic}</svg></div>${name}<span class="line" style="background:${bg}"></span></div>
      <div class="mtiles">${cats.filter((c) => (KIND[c.kind] ? c.kind : 'other') === kk).sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name)).map(tile).join('')}</div>`).join('') || '<div class="card muted">Материалов нет</div>'}</div>`;

  const applyFilter = () => {
    $$('#flt button').forEach((b) => b.classList.toggle('on', b.dataset.f === flt));
    $$('#mats .mtile').forEach((t) => { t.style.display = flt === 'all' || (flt === 'low' && t.dataset.low === 'true') || (flt === 'check' && t.dataset.check === 'true') ? '' : 'none'; });
    if (openCat) place();
  };
  // Карточка встаёт сразу под рядом плиток, где нажали, — не в конце списка
  const place = () => {
    $('#mcard')?.remove();
    $$('#mats .mtile.sel').forEach((t) => t.classList.remove('sel'));
    const t = openCat && $(`#mats .mtile[data-cat="${openCat.id}"]`);
    if (!t || t.style.display === 'none') { openCat = null; return; }
    t.classList.add('sel');
    const row = [...t.parentElement.querySelectorAll('.mtile')].filter((x) => x.style.display !== 'none' && x.offsetTop === t.offsetTop);
    const box = document.createElement('div');
    box.id = 'mcard'; box.className = 'mcard';
    row[row.length - 1].after(box);
    drawCard(box, S.cats.find((c) => c.id === openCat.id), info.get(openCat.id) || stockOf(S.cats.find((c) => c.id === openCat.id)), reload);
  };
  const open = (id, t = null) => {
    if (openCat?.id === id && !t) { openCat = null; place(); return; } // второе нажатие закрывает
    const c = S.cats.find((x) => x.id === id);
    openCat = { id, tab: t || (c?.rec_at && seePrice() ? 'price' : 'stock') };
    if (flt !== 'all' && $(`#mats .mtile[data-cat="${id}"]`)?.style.display === 'none') flt = 'all';
    applyFilter();
    $('#mcard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  $$('#flt button').forEach((b) => b.addEventListener('click', () => { flt = b.dataset.f; applyFilter(); }));
  $('#hid')?.addEventListener('click', () => { showHidden = !showHidden; drawMaterials(pane, reload); });
  $$('#mats .mtile').forEach((t) => t.addEventListener('click', () => open(t.dataset.cat)));
  $$('[data-rec]').forEach((b) => b.addEventListener('click', () => open(b.dataset.rec, 'price')));
  $('#newCat')?.addEventListener('click', () => editRow(TABLES.categories, null, reload));
  if (openCat && !openCat.tab) { const c = S.cats.find((x) => x.id === openCat.id); openCat.tab = c?.rec_at && seePrice() ? 'price' : 'stock'; }
  applyFilter();
  if (openCat) $('#mcard')?.scrollIntoView({ block: 'nearest' });
}

function drawCard(box, c, x, reload) {
  const k = kindOf(c);
  const tabs = [['stock', 'Склад'], ...(seePrice() ? [['price', 'Цена' + (c.rec_at ? ' •' : '')]] : []), ['set', 'Настройки']];
  if (!tabs.some(([t]) => t === openCat.tab)) openCat.tab = 'stock';
  box.style.borderTopColor = k.color;
  box.innerHTML = `<div class="row" style="gap:12px;align-items:center;flex-wrap:nowrap">${icon(k)}
      <div style="flex:1;min-width:0"><b style="font-size:17px">${esc(c.name)}</b><div class="muted small">${k.name} · ${x.widths.length} шир. · ${x.rolls.length} рул. в наличии</div></div>
      <button class="btn sm" id="mclose" title="Свернуть">✕</button></div>
    <div class="seg mtabs" style="margin-top:12px">${tabs.map(([t, n]) => `<button data-mt="${t}" class="${t === openCat.tab ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div id="mbody" style="margin-top:6px"></div>`;
  box.querySelector('#mclose').addEventListener('click', () => { openCat = null; box.previousElementSibling?.classList.remove('sel'); $$('#mats .mtile.sel').forEach((t) => t.classList.remove('sel')); box.remove(); });
  box.querySelectorAll('[data-mt]').forEach((b) => b.addEventListener('click', () => { openCat.tab = b.dataset.mt; drawCard(box, c, x, reload); }));
  const body = box.querySelector('#mbody');
  if (openCat.tab === 'stock') cardStock(body, c, x, k, reload);
  else if (openCat.tab === 'price') cardPrice(body, c, reload);
  else cardSettings(body, c, reload);
}

function cardStock(body, c, x, k, reload) {
  const sub = (t, hint) => `<div style="margin:14px 0 6px"><b>${t}</b>${hint ? ` <span class="muted small">— ${hint}</span>` : ''}</div>`;
  body.innerHTML = `${sub('Остаток по ширинам', 'все рулоны этой ширины вместе')}
    ${x.widths.map((w) => `<div class="row" style="gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--soft);flex-wrap:nowrap">
      <b style="width:64px;flex:none">${W(w.w)}</b>
      <div class="wbar"><i style="width:${w.full ? Math.round(100 * w.left / w.full) : 0}%;background:${w.low ? '#BA7517' : k.color}"></i></div>
      <span class="small" style="white-space:nowrap">${w.rolls.length ? `<b>${M(w.left)}</b> · ${w.rolls.length} рул. · ${num(w.rolls.reduce((a, r) => a + SQM(r), 0), 1)} м²` : 'нет в наличии'}</span>
      ${w.low ? '<span class="chip warn nodot">заканчивается</span>' : ''}
      ${app.me.perm('nomenclature') && w.m ? `<button class="btn sm" data-low-edit="${w.m.id}" title="Минимальный остаток">мин. ${w.m.low_stock_mm != null ? M(w.m.low_stock_mm) : '—'}</button>` : ''}</div>`).join('') || '<div class="muted small">Ширин ещё нет — они появятся с первым приходом.</div>'}
    ${sub('Рулоны', 'в работу первым идёт самый старый; нажмите, чтобы списать, проверить или перенести')}
    ${x.rolls.length ? `<div style="overflow-x:auto"><table class="t"><thead><tr><th>Артикул</th><th>Ширина</th><th>Остаток</th><th>Приход</th>${can.cost() ? '<th>Закупка 1 м²</th>' : ''}<th></th></tr></thead><tbody>
      ${x.rolls.map((r) => `<tr class="pick" data-roll="${r.id}"><td><span class="mono">${esc(r.article)}</span>${x.rolls.find((y) => y.width_mm === r.width_mm) === r ? ' <span class="chip ok nodot">следующий</span>' : ''}</td>
        <td>${W(r.width_mm)}</td><td style="white-space:nowrap">${M(r.length_left_mm)} <span class="muted small">из ${M(r.length_initial_mm)}</span>${bar(r)}</td>
        <td class="small">${new Date(r.purchase_date).toLocaleDateString('ru-RU')}${r.supplier ? `<div class="muted">${esc(r.supplier)}</div>` : ''}</td>
        ${can.cost() ? `<td class="small">${r.cost_sqm != null ? num(r.cost_sqm) + ' ₽' : '—'}</td>` : ''}
        <td>${unchecked(r) ? '<span class="chip warn nodot">не проверен</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="muted small">Рулонов в наличии нет.</div>'}
    ${sub('Обрезки', c.offcut_min_w_mm ? `храним от ${c.offcut_min_w_mm}×${c.offcut_min_l_mm} мм` : 'этот материал обрезки не хранит')}
    ${x.offcuts.length ? `<div class="mchips">${x.offcuts.map((o) => `<span class="chip nodot">${num(o.width_mm, 0)} × ${num(o.length_mm, 0)} мм · из <span class="mono">${esc(S.rolls.find((r) => r.id === o.roll_id)?.article || '—')}</span></span>`).join('')}</div>` : '<div class="muted small">Обрезков нет.</div>'}`;
  body.querySelectorAll('[data-roll]').forEach((t) => t.addEventListener('click', () => rollCard(S.rolls.find((r) => r.id === t.dataset.roll), reload)));
  body.querySelectorAll('[data-low-edit]').forEach((b) => b.addEventListener('click', () => lowStock(S.materials.find((m) => m.id === b.dataset.lowEdit), reload)));
}

function cardPrice(body, c, reload) {
  const box = (t, v, hint) => `<div style="background:var(--soft);border-radius:12px;padding:10px 14px;flex:1;min-width:150px"><div class="muted small">${t}</div><div style="font-size:22px;font-weight:800">${rub(v)}<span class="muted small" style="font-weight:600"> за м²</span></div>${hint ? `<div class="muted small">${hint}</div>` : ''}</div>`;
  const ink = Number(app.refs.settings.ink_client_price_sqm ?? 0);
  body.innerHTML = `<div class="row" style="gap:10px;margin-top:10px;flex-wrap:wrap">
      ${box('Печать', c.price_print_sqm, c.price_mode === 'auto' ? `материал + чернила ${rub(ink)}` : 'цена вручную')}
      ${box('Перерасход', c.price_waste_sqm, 'скидка на него не действует')}
      ${c.base_cost_sqm ? box('Закупка, от которой цена', c.base_cost_sqm, c.cost_basis?.widths?.length > 1 ? `самая дорогая из ${c.cost_basis.widths.length} ширин` : '') : ''}</div>
    ${c.rec_at ? recBlock(c, app.me.perm('nomenclature')) : `<div class="muted small" style="margin:10px 0">${c.price_mode === 'auto' ? 'Цена считается от закупки самой дорогой ширины в работе. Пока цена совпадает с расчётом — рекомендаций нет.' : 'Цена задана вручную — рекомендации не приходят.'}</div>`}
    <div style="margin:12px 0 6px"><b>Закупка по ширинам</b> <span class="muted small">— у каждой ширины последний купленный рулон</span></div>
    ${widthsTable(c.cost_basis)}`;
  const decide = (sel, call, msg) => body.querySelectorAll(sel).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await call(c.id); toast(msg); app.refs = await app.api.refs(); reload(); } catch (e) { toast(errText(e), 'bad'); b.disabled = false; }
  }));
  decide('[data-acc]', (id) => app.api.acceptPriceRec(id), 'Новая цена принята');
  decide('[data-dis]', (id) => app.api.dismissPriceRec(id), 'Цена оставлена как есть — до следующего изменения закупки');
}

// Настройки — сначала просмотр как есть, менять — кнопкой «Изменить»
function cardSettings(body, c, reload) {
  const opts = (c.allowed_options || []).map((code) => app.refs.options.find((o) => o.code === code)?.name).filter(Boolean);
  const rows = [
    ['Как считать цену', c.price_mode === 'manual' ? 'вручную' : 'от закупки и наценки'],
    ['Наценка на печать', c.price_mode === 'manual' ? '—' : num(c.markup_print_pct) + '%'],
    ['Наценка на перерасход', c.price_mode === 'manual' ? '—' : num(c.markup_waste_pct) + '%'],
    ['Белое поле по умолчанию', c.white_margin_mm + ' мм'],
    ['Раскрой', c.split_allowed ? (c.seam_glue ? 'можно, полосы клеятся в цеху' : 'можно') : 'нельзя — печать только целым полотном'],
    ['Минимальный обрезок', c.offcut_min_w_mm ? `${c.offcut_min_w_mm} × ${c.offcut_min_l_mm} мм` : 'не храним'],
    ['Постпечать', opts.length ? opts.join(', ') : 'нет'],
    ['В калькуляторе', c.active ? 'показывается' : 'скрыт'],
  ];
  body.innerHTML = `<div class="grid2" style="gap:10px 18px;margin-top:12px">${rows.map(([t, v]) => `<div><div class="muted small">${t}</div><div>${esc(v)}</div></div>`).join('')}</div>
    ${app.me.perm('nomenclature') ? '<div class="row" style="gap:8px;margin-top:14px"><button class="btn primary" id="edit">Изменить</button><button class="btn" id="copy">Сделать копию</button></div>' : ''}`;
  const def = TABLES.categories;
  body.querySelector('#edit')?.addEventListener('click', () => editRow(def, c, async () => { app.refs = await app.api.refs(); reload(); }));
  body.querySelector('#copy')?.addEventListener('click', () => editRow(def, null, async () => { app.refs = await app.api.refs(); reload(); }, { ...c, name: c.name + ' (по акции)' }));
}

const bar = (r) => `<div style="height:4px;border-radius:2px;background:var(--soft);margin-top:4px;max-width:160px"><div style="height:4px;border-radius:2px;width:${Math.round(100 * r.length_left_mm / r.length_initial_mm)}%;background:${r.length_left_mm / r.length_initial_mm < 0.15 ? 'var(--bad)' : 'var(--ok)'}"></div></div>`;

function lowStock(m, reload) {
  const d = modal(`<h3>Минимальный остаток</h3><div class="muted small">${esc(m.name)}. Когда на всех рулонах этой ширины останется меньше, материал помечается «заканчивается».</div>
    <div class="field" style="margin-top:10px"><label>Минимум, м (пусто — не следить)</label><input id="lv" inputmode="decimal" value="${m.low_stock_mm != null ? num(m.low_stock_mm / 1000, 1) : ''}"></div>
    <div class="acts"><button class="btn" id="c">Отмена</button><button class="btn primary" id="s">Сохранить</button></div>`);
  d.el.querySelector('#c').addEventListener('click', d.close);
  d.el.querySelector('#s').addEventListener('click', async () => {
    const v = parseIn(d.el.querySelector('#lv').value.trim());
    if (v !== '' && (isNaN(Number(v)) || Number(v) < 0)) return toast('Нужно число метров', 'bad');
    try { await app.api.setLowStock(m.id, v === '' ? null : Math.round(Number(v) * 1000)); d.close(); toast('Сохранено'); reload(); } catch (e) { toast(errText(e), 'bad'); }
  });
}

async function rollCard(r, reload) {
  const moves = can.view() ? await app.api.stockMoves(r.id).catch(() => []) : [];
  const staff = await app.api.staff().catch(() => []);
  const who = (id) => staff.find((s) => s.id === id)?.full_name || '';
  const d = modal(`<h3><span class="mono">${esc(r.article)}</span> · ${esc(rollName(r))}</h3>
    <div class="grid2 small" style="gap:6px 14px">
      <div><span class="muted">Ширина</span><br><b>${num(r.width_mm, 0)} мм</b></div>
      <div><span class="muted">Остаток</span><br><b>${M(r.length_left_mm)}</b> из ${M(r.length_initial_mm)} · ${num(SQM(r), 1)} м²</div>
      <div><span class="muted">Приход</span><br>${new Date(r.purchase_date).toLocaleDateString('ru-RU')}${r.doc_ref ? ' · ' + esc(r.doc_ref) : ''}${r.supplier ? ' · ' + esc(r.supplier) : ''}</div>
      ${can.cost() ? `<div><span class="muted">Закупка</span><br>${rub(r.purchase_total)} · ${rub(r.cost_sqm)}/м²</div>` : ''}
      <div><span class="muted">Остаток проверен</span><br>${r.inventory_at ? dt(r.inventory_at) : '<span class="chip warn nodot">ещё нет</span>'}</div>
    </div>
    <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
      ${can.off() && r.status === 'active' ? '<button class="btn" id="wo">Списать</button>' : ''}
      ${can.off() ? '<button class="btn" id="inv">Инвентаризация</button>' : ''}
      ${can.offcut() ? '<button class="btn" id="oc">Сохранить обрезок</button>' : ''}
      ${can.move() && r.status === 'active' ? '<button class="btn" id="mv">Перенести в другой материал</button>' : ''}</div>
    <div id="act"></div>
    <h3 style="font-size:15px;margin-top:16px">Движение по рулону</h3>
    ${moves.length ? `<table class="t"><tbody>${moves.map((x) => `<tr><td class="small">${dt(x.created_at)}</td><td class="small">${MOVE[x.type]}${x.comment ? '<div class="muted">' + esc(x.comment) + '</div>' : ''}</td><td class="small" style="text-align:right;white-space:nowrap"><b style="color:${x.delta_mm < 0 ? 'var(--bad)' : 'var(--ok)'}">${x.delta_mm > 0 ? '+' : ''}${M(x.delta_mm)}</b></td><td class="small muted">${esc(who(x.created_by))}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small">Движений пока нет</div>'}
    <div class="acts"><button class="btn" id="close">Закрыть</button></div>`, { wide: true });
  const act = d.el.querySelector('#act');
  const form = (html, onSave) => {
    act.innerHTML = `<div class="card" style="margin:10px 0 0;background:var(--soft)">${html}<div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn primary" id="go">Сохранить</button></div></div>`;
    numInputs(act);
    roundHint(act, '#wm', 'up'); roundHint(act, '#fm, #ow, #ol', 'down');
    act.querySelector('#go').addEventListener('click', async () => { try { await onSave(); d.close(); reload(); } catch (e) { toast(errText(e), 'bad'); } });
  };
  d.el.querySelector('#close').addEventListener('click', d.close);
  d.el.querySelector('#wo')?.addEventListener('click', () => form(`<div class="grid2"><div class="field"><label>Сколько списать, мм</label><input id="wm" inputmode="numeric" data-num></div>
    <div class="field"><label>Причина</label><input id="wr" placeholder="тест дюз, порча, брак"></div></div>`, async () => {
    const mm = mmUp(Math.round(Number(parseIn(act.querySelector('#wm').value))));
    if (!(mm > 0)) throw new Error('введите, сколько миллиметров списать');
    await app.api.writeoffRoll(r.id, mm, act.querySelector('#wr').value.trim());
    toast(`Списано ${M(mm)} с ${r.article}`);
  }));
  d.el.querySelector('#inv')?.addEventListener('click', () => form(`<div class="field"><label>Фактический остаток, мм</label><input id="fm" inputmode="numeric" data-num value="${r.length_left_mm}"><div class="muted small">Замерьте рулеткой или по весу. 0 — рулон закончился.</div></div>`, async () => {
    const v = parseIn(act.querySelector('#fm').value);
    if (v === '' || isNaN(Number(v))) throw new Error('введите остаток в миллиметрах');
    const fact = mmDown(Math.round(Number(v)));
    await app.api.inventoryRoll(r.id, fact);
    toast(fact === r.length_left_mm ? 'Остаток совпадает' : `Остаток ${r.article} исправлен на ${M(fact)}`);
  }));
  d.el.querySelector('#oc')?.addEventListener('click', () => {
    const c = catOf(matOf(r.material_id) || {});
    form(`<div class="muted small" style="margin-bottom:8px">${c?.offcut_min_w_mm ? `Сохраняем обрезки от ${c.offcut_min_w_mm}×${c.offcut_min_l_mm} мм в любой ориентации.` : 'Для этого материала обрезки не сохраняются (минимум не задан в «Печатных материалах»).'}</div>
      <div class="grid2"><div class="field"><label>Ширина, мм</label><input id="ow" inputmode="numeric" data-num></div><div class="field"><label>Длина, мм</label><input id="ol" inputmode="numeric" data-num></div></div>`, async () => {
      await app.api.addOffcut(r.id, Math.round(Number(parseIn(act.querySelector('#ow').value))), Math.round(Number(parseIn(act.querySelector('#ol').value))));
      toast('Обрезок сохранён');
    });
  });
  // Перенос в другой печатный материал: например, рулон, купленный дёшево, — в «Баннер по акции» со своей ценой
  d.el.querySelector('#mv')?.addEventListener('click', () => {
    const curCat = catOf(matOf(r.material_id) || {});
    const cats = app.refs.categories.filter((c) => c.id !== curCat?.id);
    form(`<div class="muted small" style="margin-bottom:8px">Сейчас рулон считается материалом «${esc(curCat?.name || '—')}». После переноса цена для клиента берётся из нового материала, а у прежнего пересчитается закупка — если цена изменится, придёт рекомендация. Артикул и остаток не меняются.</div>
      <div class="field"><label>В какой материал</label><select id="mc">${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <div class="muted small">Нужного нет? Создайте его в «Настройки → Печатные материалы»: откройте прежний материал и нажмите «Сделать копию».</div></div>`, async () => {
      const c = cats.find((x) => x.id === act.querySelector('#mc').value);
      if (!c) throw new Error('выберите материал');
      await app.api.moveRoll(r.id, c.id);
      app.refs = await app.api.refs();
      toast(`${r.article} теперь «${c.name}»`);
    });
  });
}

// ---------- приход ----------
function drawIn(pane, reload) {
  const cats = app.refs.categories;
  const line = () => `<div class="row ln" style="gap:8px;align-items:flex-end;flex-wrap:wrap;border-top:1px solid var(--soft);padding-top:10px;margin-top:10px">
    <div class="field" style="flex:3;min-width:220px"><label>Материал</label><select class="l-cat">${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field" style="width:110px"><label>Ширина, мм</label><input class="l-w" inputmode="numeric" data-num list="widths"></div>
    <div class="field" style="width:100px"><label>Длина, м</label><input class="l-l" inputmode="decimal" value="50"></div>
    <div class="field" style="width:80px"><label>Рулонов</label><input class="l-n" inputmode="numeric" value="1"></div>
    <div class="field" style="width:130px"><label>Сумма, ₽</label><input class="l-s" inputmode="decimal" data-num></div>
    <button class="btn sm bad l-x" type="button" title="Удалить строку">✕</button>
    <div class="muted small l-info" style="width:100%"></div></div>`;
  const widths = [...new Set(S.materials.map((m) => m.width_mm))].sort((a, b) => a - b);
  pane.innerHTML = `<div class="card"><h2>Новый приход</h2>
      <div class="grid2"><div class="field"><label>Номер документа</label><input id="doc" placeholder="например, 471"></div>
        <div class="field"><label>Дата</label><input id="date" type="date" value="${today()}"></div>
        <div class="field"><label>Поставщик</label><input id="sup" list="sups"></div></div>
      <datalist id="sups">${[...new Set(S.rolls.map((r) => r.supplier).filter(Boolean))].map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <datalist id="widths">${widths.map((w) => `<option value="${w}">`).join('')}</datalist>
      <div id="lines">${line()}</div>
      <button class="btn sm" id="addl" style="margin-top:10px">+ строка</button>
      <div class="row" style="justify-content:space-between;align-items:center;margin-top:14px;gap:10px;flex-wrap:wrap">
        <div id="tot" class="small"></div><button class="btn primary" id="go">Провести приход</button></div>
      <div class="muted small" style="margin-top:8px">Артикулы присвоятся сами, как на ваших наклейках: буква вида (B баннер, S самоклейка, H холст, P бумага), год закупки и сквозной номер — например, B26065. Если такой ширины материала ещё не было, он заведётся сам.</div></div>
    <div id="done"></div>`;
  const lines = $('#lines');
  const upd = () => {
    let sum = 0, n = 0;
    $$('#lines .ln').forEach((ln) => {
      const g = (c) => Number(parseIn(ln.querySelector(c).value)) || 0;
      const w = g('.l-w'), l = g('.l-l'), k = g('.l-n'), s = g('.l-s');
      sum += s; n += k;
      ln.querySelector('.l-info').textContent = w && l && k && s ? `${k} × ${num(w / 1000 * l, 1)} м² · закупка ${rub(s / (w / 1000 * l * k))}/м²` : '';
    });
    $('#tot').innerHTML = `Итого по документу: <b>${n} рул. · ${rub(sum)}</b>`;
  };
  const bind = () => { numInputs(lines); $$('#lines .l-x').forEach((b) => { b.onclick = () => { if ($$('#lines .ln').length > 1) b.closest('.ln').remove(); upd(); }; }); $$('#lines input, #lines select').forEach((i) => { i.oninput = upd; }); };
  $('#addl').addEventListener('click', () => { lines.insertAdjacentHTML('beforeend', line()); bind(); });
  bind(); upd();
  $('#go').addEventListener('click', async () => {
    const data = $$('#lines .ln').map((ln) => ({ category_id: ln.querySelector('.l-cat').value, width_mm: Math.round(Number(parseIn(ln.querySelector('.l-w').value))), length_m: Number(parseIn(ln.querySelector('.l-l').value)), count: Math.round(Number(parseIn(ln.querySelector('.l-n').value))), sum: Number(parseIn(ln.querySelector('.l-s').value)) }));
    if (!$('#doc').value.trim() || !$('#sup').value.trim()) return toast('Заполните номер документа и поставщика', 'bad');
    if (data.some((x) => !(x.width_mm > 0 && x.length_m > 0 && x.count > 0 && x.sum >= 0) || isNaN(x.sum))) return toast('В каждой строке нужны ширина, длина, количество рулонов и сумма', 'bad');
    try {
      const doc = $('#doc').value.trim();
      const arts = await app.api.receiveRolls(doc, $('#date').value, $('#sup').value.trim(), data);
      app.refs = await app.api.refs();
      S = await app.api.stock();
      toast(`Приход проведён: ${arts.length} рул.`);
      drawIn(pane, reload);
      $('#done').innerHTML = `<div class="card"><h2>Подпишите рулоны</h2><div class="muted small" style="margin-bottom:8px">Документ ${esc(doc)} проведён. Напишите артикулы на рулонах:</div>
        <div class="row" style="gap:8px;flex-wrap:wrap">${arts.map((a) => { const r = S.rolls.find((x) => x.article === a); return `<span class="chip nodot" style="font-size:14px"><span class="mono">${esc(a)}</span>&nbsp;· ${esc(r ? rollName(r) : '')}</span>`; }).join('')}</div></div>`;
    } catch (e) { toast(errText(e), 'bad'); }
  });
}

// ---------- инвентаризация ----------
function drawInv(pane, reload) {
  const rolls = S.rolls.filter((r) => r.status === 'active').sort((a, b) => (unchecked(b) - unchecked(a)) || rollName(a).localeCompare(rollName(b)) || a.article.localeCompare(b.article));
  const done = rolls.filter((r) => !unchecked(r)).length;
  pane.innerHTML = `<div class="card"><h2>Инвентаризация</h2>
    <div class="muted small">Замерьте рулон и впишите, сколько миллиметров на нём осталось на самом деле (с шагом 50 мм). Разница запишется в журнал движения. Если рулон закончился — впишите 0.</div>
    <div style="margin-top:10px"><b>Проверено ${done} из ${rolls.length}</b><div style="height:6px;border-radius:3px;background:var(--soft);margin-top:6px"><div style="height:6px;border-radius:3px;background:var(--ok);width:${rolls.length ? Math.round(100 * done / rolls.length) : 0}%"></div></div></div></div>
    <div class="card"><table class="t"><thead><tr><th>Артикул</th><th>Материал</th><th>По системе</th><th>Факт, мм</th><th></th></tr></thead><tbody>
    ${rolls.map((r) => `<tr data-r="${r.id}"><td><span class="mono">${esc(r.article)}</span>${unchecked(r) ? '<div><span class="chip warn nodot">не проверен</span></div>' : `<div class="muted small">проверен ${dt(r.inventory_at)}</div>`}</td>
      <td class="small">${esc(rollName(r))}</td><td class="small">${M(r.length_left_mm)}</td>
      <td><input class="fact" inputmode="numeric" data-num style="max-width:130px" placeholder="${num(r.length_left_mm, 0)}"></td>
      <td><button class="btn sm primary sv">Сохранить</button></td></tr>`).join('')}</tbody></table></div>`;
  numInputs($('#pane')); roundHint($('#pane'), '.fact', 'down');
  $$('#pane tr[data-r]').forEach((tr) => {
    const save = async () => {
      const r = S.rolls.find((x) => x.id === tr.dataset.r);
      const v = parseIn(tr.querySelector('.fact').value.trim());
      if (v === '' || isNaN(Number(v))) return toast('Впишите фактический остаток в миллиметрах', 'bad');
      try {
        const fact = mmDown(Math.round(Number(v)));
        await app.api.inventoryRoll(r.id, fact);
        toast(fact === r.length_left_mm ? `${r.article}: остаток совпадает` : `${r.article}: ${M(r.length_left_mm)} → ${M(fact)}`);
        S = await app.api.stock(); drawInv(pane, reload);
      } catch (e) { toast(errText(e), 'bad'); }
    };
    tr.querySelector('.sv').addEventListener('click', save);
    tr.querySelector('.fact').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  });
}

// ---------- обрезки ----------
function drawOffcuts(pane, reload) {
  const list = S.offcuts.map((o) => ({ o, r: S.rolls.find((r) => r.id === o.roll_id) }));
  pane.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><div><h2 style="margin:0">Банк обрезков</h2>
      <div class="muted small">Обрезки, которые стоит хранить: минимальный размер задаётся в «Настройки → Печатные материалы». Баннер обычно не храним.</div></div>
      ${can.offcut() ? '<button class="btn primary" id="add">+ Обрезок</button>' : ''}</div></div>
    <div class="olist">${list.map(({ o, r }) => `<div class="ocard"><div><b>${num(o.width_mm, 0)} × ${num(o.length_mm, 0)} мм</b> · ${esc(r ? rollName(r) : '—')}
      <div class="muted small">из рулона <span class="mono">${esc(r?.article || '—')}</span> · ${dt(o.created_at)}</div></div>
      <div class="sum">${can.offcut() ? `<button class="btn sm" data-wo="${o.id}">Списать</button>` : ''}</div></div>`).join('') || '<div class="card muted">Обрезков нет</div>'}</div>`;
  $$('[data-wo]').forEach((b) => b.addEventListener('click', async () => {
    const reason = prompt('Причина списания обрезка', 'испорчен');
    if (reason == null) return;
    try { await app.api.writeoffOffcut(b.dataset.wo, reason); toast('Обрезок списан'); reload(); } catch (e) { toast(errText(e), 'bad'); }
  }));
  $('#add')?.addEventListener('click', () => {
    const rolls = S.rolls.filter((r) => catOf(matOf(r.material_id) || {})?.offcut_min_w_mm);
    const d = modal(`<h3>Новый обрезок</h3>
      <div class="field"><label>С какого рулона</label><select id="rr">${rolls.map((r) => `<option value="${r.id}">${esc(r.article)} · ${esc(rollName(r))}</option>`).join('')}</select>
      <div class="muted small">Здесь только материалы, у которых задан минимальный обрезок.</div></div>
      <div class="grid2" style="margin-top:8px"><div class="field"><label>Ширина, мм</label><input id="ow" inputmode="numeric" data-num></div><div class="field"><label>Длина, мм</label><input id="ol" inputmode="numeric" data-num></div></div>
      <div class="acts"><button class="btn" id="c">Отмена</button><button class="btn primary" id="s">Сохранить</button></div>`);
    numInputs(d.el); roundHint(d.el, '#ow, #ol', 'down');
    d.el.querySelector('#c').addEventListener('click', d.close);
    d.el.querySelector('#s').addEventListener('click', async () => {
      try { await app.api.addOffcut(d.el.querySelector('#rr').value, Math.round(Number(parseIn(d.el.querySelector('#ow').value))), Math.round(Number(parseIn(d.el.querySelector('#ol').value)))); d.close(); toast('Обрезок сохранён'); reload(); }
      catch (e) { toast(errText(e), 'bad'); }
    });
  });
}

// ---------- движение ----------
async function drawMoves(pane) {
  const [moves, staff] = await Promise.all([app.api.stockMoves(), app.api.staff().catch(() => [])]);
  const who = (id) => staff.find((s) => s.id === id)?.full_name || '';
  pane.innerHTML = `<div class="card"><h2>Движение материала</h2>
    <div class="seg" id="mf" style="margin-bottom:10px;flex-wrap:wrap"><button data-f="" class="on">Все</button>${Object.entries(MOVE).filter(([k]) => k !== 'offcut_out').map(([k, t]) => `<button data-f="${k}">${t}</button>`).join('')}</div>
    ${moves.length ? `<table class="t"><thead><tr><th>Когда</th><th>Что</th><th>Рулон</th><th style="text-align:right">Метры</th><th>Документ / причина</th><th>Кто</th></tr></thead><tbody>
    ${moves.map((x) => `<tr data-type="${x.type}"><td class="small">${dt(x.created_at)}</td><td class="small">${MOVE[x.type]}</td>
      <td class="small"><span class="mono">${esc(x.roll?.article || '—')}</span><div class="muted">${esc(matOf(x.roll?.material_id)?.name || '')}</div></td>
      <td class="small" style="text-align:right;white-space:nowrap"><b style="color:${x.delta_mm < 0 ? 'var(--bad)' : 'var(--ok)'}">${x.delta_mm > 0 ? '+' : ''}${M(x.delta_mm)}</b></td>
      <td class="small">${x.doc ? 'Док. ' + esc(x.doc) : ''}${x.comment ? esc(x.comment) : ''}</td><td class="small muted">${esc(who(x.created_by))}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Записей пока нет</div>'}</div>`;
  $$('#mf button').forEach((b) => b.addEventListener('click', () => {
    $$('#mf button').forEach((x) => x.classList.toggle('on', x === b));
    $$('#pane tr[data-type]').forEach((tr) => { tr.style.display = !b.dataset.f || tr.dataset.type === b.dataset.f ? '' : 'none'; });
  }));
}

// ---------- чернила ----------
async function drawInk(pane, reload) {
  const [events, periods] = await Promise.all([app.api.inkEvents(), can.cost() ? app.api.inkPeriods().catch(() => []) : []]);
  const printers = app.refs.printers;
  const pname = (id) => printers.find((p) => p.id === id)?.name || '';
  const stat = Object.keys(INK).map((ch) => {
    const ps = periods.filter((p) => p.channel === ch && Number(p.printed_sqm) > 0);
    const vol = ps.reduce((a, p) => a + Number(p.volume_ml), 0), sq = ps.reduce((a, p) => a + Number(p.printed_sqm), 0), cost = ps.reduce((a, p) => a + Number(p.price_rub || 0), 0);
    return { ch, n: ps.length, mlSqm: sq ? vol / sq : null, rubSqm: sq && cost ? cost / sq : null };
  });
  pane.innerHTML = `<div class="card"><h2>Чернила и сольвент</h2>
      <div class="muted small">Нажмите кнопку в момент, когда вскрываете новую бутылку или снимаете бутылку отработки. Неважно, заливается бутылка целиком или частями: важен момент вскрытия. Из этих отметок и напечатанных метров система считает настоящий расход.</div>
      <div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="open">Открыта новая бутылка</button><button class="btn" id="waste">Снята бутылка отработки</button></div></div>
    ${can.cost() ? `<div class="card"><h2>Фактический расход</h2>
      <div class="muted small" style="margin-bottom:8px">Период — между вскрытиями двух бутылок одного цвета. Расход становится точным, когда по цвету накопится хотя бы два периода.</div>
      <table class="t"><thead><tr><th>Цвет</th><th>Периодов</th><th>Расход, мл/м²</th><th>Стоимость на 1 м²</th></tr></thead><tbody>
      ${stat.map((s) => `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${INK_COLOR[s.ch]};margin-right:6px"></i>${INK[s.ch]}</td><td>${s.n}</td><td>${s.mlSqm != null ? num(s.mlSqm, 1) : '—'}</td><td>${s.rubSqm != null ? rub(s.rubSqm) : '—'}</td></tr>`).join('')}
      <tr><td><b>Итого</b></td><td></td><td><b>${stat.some((s) => s.mlSqm != null) ? num(stat.reduce((a, s) => a + (s.mlSqm || 0), 0), 1) : '—'}</b></td><td><b>${stat.some((s) => s.rubSqm != null) ? rub(stat.reduce((a, s) => a + (s.rubSqm || 0), 0)) : '—'}</b></td></tr></tbody></table>
      <div class="muted small" style="margin-top:6px">Сейчас в себестоимости — норма ${num(app.refs.settings.ink_norm_ml_sqm)} мл/м² по ${num(app.refs.settings.ink_price_ml_rub)} ₽/мл (Настройки → Калькулятор).</div></div>` : ''}
    <div class="card"><h2>Последние отметки</h2>${events.length ? `<table class="t"><tbody>${events.map((e) => `<tr><td class="small">${dt(e.happened_at)}</td><td class="small">${e.type === 'bottle_opened' ? 'Открыта бутылка · ' + INK[e.channel] : 'Снята отработка'}</td><td class="small">${num(e.volume_ml, 0)} мл</td><td class="small muted">${printers.length > 1 ? esc(pname(e.printer_id)) : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Отметок пока нет</div>'}</div>`;
  const ask = (type) => {
    const d = modal(`<h3>${type === 'bottle_opened' ? 'Открыта новая бутылка' : 'Снята бутылка отработки'}</h3>
      ${printers.length > 1 ? `<div class="field"><label>Принтер</label><select id="pp">${printers.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>` : ''}
      ${type === 'bottle_opened' ? `<div class="field" style="margin-top:8px"><label>Цвет</label><div class="row" style="gap:6px;flex-wrap:wrap" id="chs">${Object.entries(INK).map(([k, t], i) => `<button type="button" class="btn sm ${i === 0 ? 'primary' : ''}" data-ch="${k}">${t}</button>`).join('')}</div></div>` : ''}
      <div class="grid2" style="margin-top:8px"><div class="field"><label>Объём, мл</label><input id="vol" inputmode="numeric" data-num value="1000"></div>
      ${type === 'bottle_opened' && can.cost() ? '<div class="field"><label>Цена бутылки, ₽ (если знаете)</label><input id="pr" inputmode="decimal" data-num></div>' : ''}</div>
      <div class="acts"><button class="btn" id="c">Отмена</button><button class="btn primary" id="s">Отметить</button></div>`);
    numInputs(d.el);
    let ch = 'C';
    d.el.querySelectorAll('[data-ch]').forEach((b) => b.addEventListener('click', () => { ch = b.dataset.ch; d.el.querySelectorAll('[data-ch]').forEach((x) => x.classList.toggle('primary', x === b)); }));
    d.el.querySelector('#c').addEventListener('click', d.close);
    d.el.querySelector('#s').addEventListener('click', async () => {
      const vol = Number(parseIn(d.el.querySelector('#vol').value));
      if (!(vol > 0)) return toast('Укажите объём', 'bad');
      const pr = d.el.querySelector('#pr') ? Number(parseIn(d.el.querySelector('#pr').value)) || null : null;
      try {
        await app.api.addInkEvent({ printer_id: d.el.querySelector('#pp')?.value || printers[0].id, type, channel: type === 'bottle_opened' ? ch : null, volume_ml: vol, price_rub: pr, created_by: app.me.id });
        d.close(); toast('Отмечено'); reload();
      } catch (e) { toast(errText(e), 'bad'); }
    });
  };
  $('#open').addEventListener('click', () => ask('bottle_opened'));
  $('#waste').addEventListener('click', () => ask('waste_removed'));
}
