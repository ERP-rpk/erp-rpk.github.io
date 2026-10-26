// Закупка по ширинам и рекомендация цены печатного материала (миграция 016): общее для склада и настроек.
import { app } from './app.js?v=f8825c7';
import { esc, num, rub, dt } from './ui.js?v=f8825c7';

const W = (mm) => num(mm / 1000, 3) + ' м';
const R2 = (x) => num(x) + ' ₽';
const D = (s) => new Date(s).toLocaleDateString('ru-RU');

// b — category_cost_basis: у каждой ширины последний рулон; цена считается от самой дорогой ширины в работе
export function widthsTable(b) {
  if (!b?.widths?.length) return '<div class="muted small">Рулонов этого материала ещё не было — цена посчитается от первого прихода.</div>';
  const months = app.refs.settings.price_width_active_months ?? 6;
  return `<div style="overflow-x:auto"><table class="t"><thead><tr><th>Ширина</th><th>Последний рулон</th><th>Закупка 1 м²</th><th></th></tr></thead><tbody>${b.widths.map((w) => `<tr${w.width_mm === b.width_mm ? ' style="background:var(--soft)"' : ''}>
    <td>${W(w.width_mm)}</td><td class="small"><span class="mono">${esc(w.article)}</span> от ${D(w.purchase_date)}</td><td><b>${R2(w.cost_sqm)}</b></td>
    <td class="small">${w.width_mm === b.width_mm ? '<span class="chip ok nodot">от неё цена</span>' : w.in_work ? (w.in_stock ? 'есть на складе' : 'покупали недавно') : `<span class="muted">не учитывается: нет на складе и не покупали ${num(months, 0)} мес.</span>`}</td></tr>`).join('')}</tbody></table></div>`;
}

// Почему система предлагает эту цену — по шагам, чтобы директор мог проверить расчёт сам
export function recSteps(c) {
  const b = c.rec_basis || {};
  const base = Number(b.base_used), ink = Number(b.ink) || 0, mp = Number(b.markup_print_pct), mw = Number(b.markup_waste_pct);
  const pp = Number(c.price_print_sqm), pw = Number(c.price_waste_sqm), rp = Number(c.rec_print_sqm), rw = Number(c.rec_waste_sqm);
  const w = (b.widths || []).find((x) => x.width_mm === b.width_mm);
  const earn = (x) => (x < 0 ? `<b style="color:var(--bad)">минус ${rub(-x)}</b>` : rub(x));
  const steps = [];
  if (b.prev_base != null && Number(b.prev_base) !== base) {
    const d = (base / Number(b.prev_base) - 1) * 100;
    steps.push(`Закупка 1 м², от которой считается цена, ${base > b.prev_base ? 'выросла' : 'снизилась'}: было ${R2(b.prev_base)}, стало ${R2(base)} (${d > 0 ? '+' : ''}${num(d, 1)}%).`);
  }
  if (Number(b.current_cost_sqm) > Number(b.base || 0)) steps.push(`Вы указали текущую закупку ${R2(b.current_cost_sqm)} за м² — она выше, чем у рулонов, поэтому расчёт от неё.`);
  else if (b.fallback && w) steps.push(`Ни одной ширины нет на складе, и давно не покупали — берём последний купленный рулон: ${W(w.width_mm)}, <span class="mono">${esc(w.article)}</span> от ${D(w.purchase_date)}, ${R2(w.cost_sqm)} за м².`);
  else if (w) steps.push(`Берём самую дорогую ширину из тех, что в работе: ${W(w.width_mm)}, рулон <span class="mono">${esc(w.article)}</span> от ${D(w.purchase_date)} — ${R2(w.cost_sqm)} за м². Так ни одна ширина не продаётся в минус. Все ширины — в таблице ниже.`);
  steps.push(`Печать: ${num(base)} × (1 + ${num(mp)}%) = ${num(base * (1 + mp / 100))} → вверх до 5 ₽ = ${rub(rp - ink)}, плюс чернила ${rub(ink)} = <b>${rub(rp)} за м²</b>.`);
  steps.push(`Перерасход: ${num(base)} × (1 + ${num(mw)}%) = ${num(base * (1 + mw / 100))} → вверх до 5 ₽ = <b>${rub(rw)} за м²</b>.`);
  if (rp > pp || rw > pw) steps.push(`Если оставить как есть: на самом дорогом рулоне материал приносит с 1 м² печати ${earn(pp - ink - base)} вместо ${rub(rp - ink - base)}, с 1 м² перерасхода — ${earn(pw - base)} вместо ${rub(rw - base)}.`);
  else steps.push(`Сейчас цена выше расчётной. Снизите — наценка сохранится, клиенту дешевле. Оставите — с каждого м² зарабатываете больше: печать ${rub(pp - ink - base)} вместо ${rub(rp - ink - base)}, перерасход ${rub(pw - base)} вместо ${rub(rw - base)}.`);
  return steps;
}


// Рекомендация внутри карточки материала: что предлагаем, почему, и кнопки решения
export function recBlock(c, canDecide) {
  const up = Number(c.rec_print_sqm) > Number(c.price_print_sqm) || Number(c.rec_waste_sqm) > Number(c.price_waste_sqm);
  const arrow = (from, to) => (Number(from) === Number(to) ? `<b>${rub(to)}</b>` : `<span class="muted" style="text-decoration:line-through">${rub(from)}</span> → <b>${rub(to)}</b>`);
  return `<div class="rec" data-rc="${c.id}">
    <div class="row" style="justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div><b>Рекомендуем новую цену</b> <span class="chip warn nodot">${up ? 'закупка выросла' : 'закупка снизилась'}</span>
        <div style="margin-top:6px">Печать ${arrow(c.price_print_sqm, c.rec_print_sqm)} за м² · перерасход ${arrow(c.price_waste_sqm, c.rec_waste_sqm)} за м²</div>
        <div class="muted small">рекомендация от ${dt(c.rec_at)}</div></div>
      ${canDecide ? `<div class="row" style="gap:8px"><button class="btn primary" data-acc="${c.id}">Принять ${rub(c.rec_print_sqm)}</button><button class="btn" data-dis="${c.id}">Оставить как есть</button></div>` : ''}</div>
    <div style="margin-top:10px"><b class="small">Почему такая цена</b><ol class="small" style="margin:6px 0 0;padding-left:20px;line-height:1.5">${recSteps(c).map((s) => `<li>${s}</li>`).join('')}</ol></div></div>`;
}
