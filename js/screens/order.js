// Карточка заказа: этапы, позиции, оплата, подтверждения, история.
import { app, setTitle } from '../app.js?v=f8825c7';
import { $, $$, esc, rub, num, dt, toast, modal, errText, STATUS, STATUS_FLOW, ITEM_STATUS, URGENCY } from '../ui.js?v=f8825c7';
import { calcItem } from '../calc-core.js?v=f8825c7';
import { makeCtx } from '../calc-ctx.js?v=f8825c7';
import { schemeSvg, layoutText } from '../scheme.js?v=f8825c7';
import { STATUS_CHIP } from './orders.js?v=f8825c7';
import { BIND, HOLES, FORMATS } from '../poly-core.js?v=f8825c7';

const POLY_STATUS = { queue: ['Ждёт ризографа', ''], printed: ['Напечатано', 'ok'], ready: ['Готово', 'ok'] };
// Позиция полиграфии: что заказано, задания ризографа, из чего цена (тем, кто видит себестоимость)
function polyHtml(it, who, seeCost) {
  const p = it.params || {};
  const what = it.kind === 'blank'
    ? `${FORMATS[it.fmt]?.name || it.fmt}, ${esc(it.color || '')} · ${num(it.qty, 0)} шт × ${num(it.price_per, 2)} ₽`
    : `${it.qty} кн. × ${rub(it.price_per)} · ${esc(BIND[p.bind] || '')}${p.bind === 'metal' ? ', ' + HOLES[p.holes || 'round'] + ' отверстия' : ''}${p.coil ? `, ⌀ ${num(p.coil, 1)} мм` : ''}${p.spread ? ' · через разворот' : ''}${p.frontNoPrint ? ' · лицевая без печати' : ''}`;
  const [st, cls] = POLY_STATUS[it.status] || [it.status, ''];
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Позиция ${it.position} · ${it.kind === 'blank' ? 'бланк' : 'журнал'}</h2><span class="chip ${cls}">${st}</span></div>
    <div style="margin:8px 0"><b>${esc(it.title)}</b><div class="muted small">${what}</div></div>
    ${it.kind === 'book' && p.sections ? `<div class="muted small">${p.sections.map((x) => `${esc(x.name)}: ${x.sheets} л, ${esc(x.color)}`).join(' · ')}</div>` : ''}
    <div class="row small" style="margin-top:8px;gap:14px"><span>Сумма <b>${rub(it.total)}</b></span><span>Тиражей на ризографе: ${(it.jobs_done || []).length} из ${(it.jobs || []).length}</span><span>Печатал: ${esc(who(it.print_by))}</span></div>
    ${seeCost && it.lines?.length ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer">Из чего цена</summary><table class="t"><tbody>${it.lines.map((l) => `<tr><td>${esc(l.name)}${l.temp ? ' <span class="chip warn nodot">временная</span>' : ''}</td><td class="r muted small">${esc(l.qty)}</td><td class="r">${num(l.price, 2)} ₽</td><td class="r muted">${num(l.cost, 2)} ₽</td></tr>`).join('')}</tbody></table></details>` : ''}
  </div>`;
}

const OPT_NAME = (code) => app.refs.options.find((o) => o.code === code)?.name || ({ raskroy: 'Раскрой' }[code] || code);
let staff = null;

// Брак позиции: что случилось и чей он. Решает менеджер или директор (право «Решать, чей брак»).
const FAULT = { review: ['Ждёт решения', 'warn'], printer: ['Вина печатника', 'bad'], tech: ['Технический брак', 'blue'] };
function brakHtml(list, who) {
  if (!list.length) return '';
  const can = app.me.perm('brak_fault');
  return `<div style="margin-top:10px;border-top:1px solid var(--soft);padding-top:8px"><b class="small" style="color:var(--bad)">Брак</b>${list.map((b) => `
    <div class="small" style="margin-top:6px"><span class="muted">${dt(b.created_at)}</span> · ${num(b.length_mm, 0)} мм · ${esc(b.reason)} — ${esc(b.comment)} · ${esc(who(b.created_by))}
      ${b.lesson ? `<div style="margin-top:2px">Вывод: <b>${esc(b.lesson)}</b></div>` : ''}
      <span class="chip ${FAULT[b.fault][1]} nodot">${FAULT[b.fault][0]}</span>${app.me.perm('see_cost') ? ` <span class="muted">материал ${rub(b.cost_rub)}</span>` : ''}
      ${can ? `<div class="row" style="gap:6px;margin-top:4px"><button class="btn sm ${b.fault === 'printer' ? 'primary' : ''}" data-bf="${b.id}" data-f="printer">Вина печатника</button><button class="btn sm ${b.fault === 'tech' ? 'primary' : ''}" data-bf="${b.id}" data-f="tech">Технический брак</button></div>` : ''}</div>`).join('')}</div>`;
}

export async function renderOrder(el, id) {
  const [o, people] = await Promise.all([app.api.getOrder(id), staff ? Promise.resolve(staff) : app.api.staff().catch(() => [])]);
  staff = people;
  const who = (uid) => staff.find((s) => s.id === uid)?.full_name || '—';
  setTitle('Заказ ' + (o.number || 'черновик'));
  const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
  const rest = Math.max(0, Number(o.total) - paid);
  const idx = STATUS_FLOW.indexOf(o.status);
  const next = STATUS_FLOW[idx + 1];
  const prev = STATUS_FLOW[idx - 1];
  const pending = o.approvals.filter((a) => a.status === 'pending');
  const rejected = o.approvals.filter((a) => a.status === 'rejected');
  const isDir = app.me.role === 'director';
  const seeCost = app.me.perm('see_cost');
  const canEditRoll = ['placed', 'layout_approved'].includes(o.status);
  const methods = app.refs.methods;

  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div class="row" style="gap:10px;align-items:center"><span class="mono" style="font-size:18px">${esc(o.number || 'черновик')}</span>
          <span class="chip ${STATUS_CHIP[o.status]}">${STATUS[o.status]}</span>
          ${o.urgency !== 'standard' ? `<span class="chip ${o.urgency === 'urgent' ? 'bad' : 'warn'} nodot">${URGENCY[o.urgency]}</span>` : ''}
          <span class="chip ${rest ? 'bad' : 'ok'} nodot">${rest ? 'Не оплачен' : '✓ Оплачен'}</span></div>
        <div style="font-size:22px;font-weight:800">${rub(o.total)}</div>
      </div>
      ${o.status !== 'cancelled' && idx >= 0 ? `<div class="steps">${STATUS_FLOW.map((s, i) => `<div class="${i < idx ? 'done' : i === idx ? 'cur' : ''}"><i></i>${STATUS[s]}</div>`).join('')}</div>` : ''}
      ${pending.map((a) => `<div class="alert">Ждёт подтверждения директора: ${a.reason === 'discount_over_limit' ? `скидка ${esc(a.details?.discount_pct)}% выше лимита ${esc(a.details?.limit)}%` : `отрицательная маржа ${rub(a.details?.margin)}`}
        ${app.me.perm('approve') ? `<div class="row" style="margin-top:8px"><button class="btn sm primary" data-ap="${a.id}" data-v="1">Подтвердить</button><button class="btn sm bad" data-ap="${a.id}" data-v="0">Отклонить</button></div>` : ''}</div>`).join('')}
      ${rejected.length ? '<div class="alert bad">Директор отклонил заказ. Измените скидку или цену — запрос уйдёт заново.</div>' : ''}
      <div class="row" style="justify-content:space-between;margin-top:6px">
        <div class="row">
          ${prev && o.status !== 'issued' ? `<button class="btn" id="back">← ${STATUS[prev]}</button>` : ''}
          ${next ? `<button class="btn dark" id="fwd">Перевести в «${STATUS[next]}» →</button>` : ''}
        </div>
        ${!['issued', 'cancelled'].includes(o.status) ? '<button class="btn bad" id="cancel">Отменить заказ</button>' : ''}
      </div>
    </div>

    <div class="grid2">
      <div>
        <div class="card"><h2>Клиент и сроки</h2>
          <dl class="kv">
            <dt>Клиент</dt><dd>${esc(o.client?.name || '—')}${o.client?.phone ? `<div class="muted small">${esc(o.client.phone)}</div>` : ''}</dd>
            <dt>Менеджер</dt><dd>${esc(who(o.manager_id))}</dd>
            <dt>Принтер</dt><dd>${esc(o.printer?.name || '—')}</dd>
            <dt>Срок</dt><dd>${dt(o.due_at)}</dd>
            <dt>Оформлен</dt><dd>${dt(o.placed_at)}</dd>
          </dl>
        </div>
        <div class="card"><h2>Сумма</h2>
          <div class="total-line"><span>Печать</span><span>${rub(o.sum_print)}</span></div>
          <div class="total-line"><span>Постпечать</span><span>${rub(o.sum_post)}</span></div>
          <div class="total-line"><span>Перерасход</span><span>${rub(o.sum_waste)}</span></div>
          ${Number(o.sum_discount) ? `<div class="total-line"><span>Скидка ${num(o.discount_pct)}%</span><span>−${rub(o.sum_discount)}</span></div>` : ''}
          ${Number(o.sum_urgency) ? `<div class="total-line"><span>Срочность</span><span>+${rub(o.sum_urgency)}</span></div>` : ''}
          <div class="total-line big"><span>Итого</span><span>${rub(o.total)}</span></div>
          ${seeCost ? `<div class="total-line small"><span>Себестоимость / маржа</span><span>${rub(o.cost_total)} / <b style="color:${Number(o.margin) < 0 ? 'var(--bad)' : 'var(--ok)'}">${rub(o.margin)}</b></span></div>` : ''}
        </div>
        <div class="card"><h2>Оплата</h2>
          ${o.payments.map((p) => `<div class="total-line small"><span>${dt(p.received_at)} · ${esc(methods.find((m) => m.code === p.method)?.name || p.method)}</span><span>${rub(p.amount)}</span></div>`).join('') || '<div class="muted small">Оплат пока нет</div>'}
          <div class="total-line"><span>Оплачено / осталось</span><b>${rub(paid)} / ${rub(rest)}</b></div>
          ${rest && app.me.perm('take_payment') && o.status !== 'cancelled' ? '<button class="btn primary" id="pay" style="margin-top:10px">Принять оплату</button>' : ''}
        </div>
      </div>
      <div>
        ${o.items.map((it) => `
          <div class="card">
            <div class="row" style="justify-content:space-between"><h2 style="margin:0">Позиция ${it.position} · ${esc(it.category?.name || '')}</h2><span class="chip">${ITEM_STATUS[it.status]}</span></div>
            <div style="margin:8px 0"><b>${num(it.width_mm, 0)}×${num(it.length_mm, 0)} мм</b> · ${it.qty} шт · белое поле ${it.frame_mm} мм</div>
            <div class="muted small">${Object.keys(it.options || {}).map(OPT_NAME).map(esc).join(', ') || 'без обработки'}</div>
            ${it.layout ? `<div class="muted small" style="margin-top:4px">${layoutText(it.layout)}</div>` : ''}
            <div class="row small" style="margin-top:8px;gap:14px"><span>${it.offcut_id ? '<span class="chip violet nodot">на обрезке</span> от рулона' : 'Рулон'} <b>${esc(it.roll?.article || '—')}</b></span><span>Печатал: ${esc(who(it.print_by))}</span><span>Постпечать: ${esc(who(it.post_by))}</span></div>
            ${canEditRoll ? `<button class="btn sm" data-roll="${it.id}" style="margin-top:8px">Заменить рулон</button>` : ''}
            ${brakHtml((o.brak || []).filter((b) => b.item_id === it.id), who)}
            ${it.layout ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer">Схема раскроя</summary>${schemeSvg({ layout: it.layout, qty: it.qty }, makeCtx(app.refs, app.refs.categories[0], app.refs.printers.find((p) => p.id === o.printer_id) || app.refs.printers[0]).printer)}</details>` : ''}
          </div>`).join('')}
        ${(o.poly || []).map((it) => polyHtml(it, who, seeCost)).join('')}
        <div class="card"><h2>История</h2>${o.history.map((h) => `<div class="small" style="padding:4px 0"><span class="muted">${dt(h.at)}</span> · ${esc(who(h.who))} · ${esc(h.what.replace(/\b[a-z_]+\b/g, (s) => STATUS[s] || s))}</div>`).join('') || '<div class="muted small">Пока пусто</div>'}</div>
      </div>
    </div>`;

  const reload = () => renderOrder(el, id);
  const act = async (fn, okText) => { try { await fn(); if (okText) toast(okText); } catch (e) { toast(errText(e), 'bad'); } reload(); };
  $('#fwd')?.addEventListener('click', () => act(() => app.api.setStatus(id, next), `Заказ переведён в «${STATUS[next]}»`));
  $('#back')?.addEventListener('click', () => act(() => app.api.setStatus(id, prev), `Этап возвращён: «${STATUS[prev]}»`));
  $('#cancel')?.addEventListener('click', () => { if (confirm('Отменить заказ ' + (o.number || '') + '?')) act(() => app.api.setStatus(id, 'cancelled'), 'Заказ отменён'); });
  $$('[data-bf]').forEach((b) => b.addEventListener('click', () => act(() => app.api.decideBrak(b.dataset.bf, b.dataset.f), b.dataset.f === 'printer' ? 'Брак: вина печатника, себестоимость удержится' : 'Брак: технический, без удержания')));
  $$('[data-ap]').forEach((b) => b.addEventListener('click', () => act(() => app.api.decideApproval(b.dataset.ap, b.dataset.v === '1'), b.dataset.v === '1' ? 'Подтверждено' : 'Отклонено')));
  $('#pay')?.addEventListener('click', () => {
    const m = modal(`<h3>Принять оплату · осталось ${rub(rest)}</h3>
      <div class="seg" id="pm">${methods.map((p, i) => `<button data-m="${p.code}" class="${i === 0 ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>
      <div class="field" style="margin-top:10px;width:180px"><label>Сумма, ₽</label><input id="pa" inputmode="decimal" value="${rest}"></div>
      <div class="acts"><button class="btn" id="pc">Отмена</button><button class="btn primary" id="pg">Принять</button></div>`);
    m.el.querySelectorAll('#pm button').forEach((b) => b.addEventListener('click', () => m.el.querySelectorAll('#pm button').forEach((x) => x.classList.toggle('on', x === b))));
    m.el.querySelector('#pc').addEventListener('click', m.close);
    m.el.querySelector('#pg').addEventListener('click', () => {
      const amount = Number(m.el.querySelector('#pa').value.replace(',', '.'));
      if (!(amount > 0)) return toast('Введите сумму');
      m.close();
      act(() => app.api.addPayment(id, m.el.querySelector('#pm button.on').dataset.m, amount, app.me.id), 'Оплата принята');
    });
  });
  $$('[data-roll]').forEach((b) => b.addEventListener('click', () => changeRoll(o, o.items.find((x) => x.id === b.dataset.roll), reload)));
}

// Ручная замена рулона: цена клиенту не меняется, пересчитывается только себестоимость
function changeRoll(o, it, reload) {
  const cat = app.refs.categories.find((c) => c.id === it.category_id);
  const printer = app.refs.printers.find((p) => p.id === o.printer_id) || app.refs.printers[0];
  const ctx = makeCtx(app.refs, cat, printer);
  const m = modal(`<h3>Заменить рулон · позиция ${it.position}</h3>
    <div class="muted small">Цена клиенту не изменится, пересчитается только себестоимость.</div>
    <div class="field" style="margin-top:10px"><select id="rs">${ctx.rolls.map((r) => `<option value="${r.id}" ${r.id === it.roll_id ? 'selected' : ''}>${esc(r.article)} · ${num(r.widthMm / 1000, 2)} м · остаток ${num(r.leftMm / 1000, 1)} м</option>`).join('')}</select></div>
    <div class="acts"><button class="btn" id="rc">Отмена</button><button class="btn primary" id="rg">Заменить</button></div>`);
  m.el.querySelector('#rc').addEventListener('click', m.close);
  m.el.querySelector('#rg').addEventListener('click', async () => {
    const rollId = m.el.querySelector('#rs').value;
    try {
      const x = calcItem({ widthMm: it.width_mm, lengthMm: it.length_mm, qty: it.qty, frameMm: it.frame_mm, options: it.options, rollId }, ctx);
      const roll = x.layout.roll;
      const { roll: _r, ...layout } = x.layout;
      const others = o.items.filter((y) => y.id !== it.id).reduce((s, y) => s + Number(y.cost), 0);
      const cost = others + x.cost;
      const margin = Number(o.total) - cost - Number(o.total) * ctx.settings.taxUsnPct / 100;
      await app.api.updateItem(it.id, { roll_id: roll.id, material_id: roll.materialId, offcut_id: null, cost: x.cost, layout: { ...layout, optionQty: Object.fromEntries(Object.entries(x.options).map(([k, v]) => [k, v.qty])) }, roll_length_mm: x.layout.rollLengthMm, waste_sqm: x.layout.wasteSqm });
      await app.api.updateOrder(o.id, { cost_total: cost, margin });
      m.close(); toast('Рулон заменён' + (margin < 0 ? ' — заказ в минус, нужен директор' : ''));
    } catch (e) { toast(errText(e), 'bad'); }
    reload();
  });
}
