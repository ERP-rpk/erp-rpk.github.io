// Экран «Заказы»: список в стиле CRM — номер, статус, клиент, сумма.
import { app, setTitle } from '../app.js?v=f8825c7';
import { $, $$, esc, rub, dt, STATUS, URGENCY } from '../ui.js?v=f8825c7';

export const STATUS_CHIP = { placed: 'blue', layout_approved: 'violet', printing: 'warn', postprint: 'warn', ready: 'ok', issued: '', cancelled: 'bad', draft: '' };
const TABS = { active: ['placed', 'layout_approved', 'printing', 'postprint', 'ready'], issued: ['issued'], cancelled: ['cancelled'] };
let tab = 'active', query = '', dir = 'all';
// направление заказа: полиграфия — если в нём есть позиции полиграфии
const DIRS = [['all', 'Все направления'], ['wide', 'Широкоформат'], ['poly', 'Полиграфия']];
const dirOf = (o) => (o.poly_count > 0 ? 'poly' : 'wide');
// направления, на которые у сотрудника есть право (агент видит заказы только своих направлений)
const PERM_OF = { wide: 'calc_wide', poly: 'calc_poly' };
const dirs = () => { const own = DIRS.filter(([k]) => k !== 'all' && app.me.perm(PERM_OF[k])); return own.length > 1 ? DIRS.filter(([k]) => k === 'all' || own.some(([x]) => x === k)) : own; };
const allowedDir = (o) => app.me.role !== 'agent' || app.me.perm(PERM_OF[dirOf(o)]);

export async function renderOrders(el) {
  setTitle('Заказы');
  const all = await app.api.listOrders({});
  const counts = Object.fromEntries(TABS.active.map((s) => [s, all.filter((o) => o.status === s).length]));
  if (!dirs().some(([k]) => k === dir)) dir = dirs()[0]?.[0] || 'all';
  const list = all.filter((o) => TABS[tab].includes(o.status) && allowedDir(o) && (dir === 'all' || dirOf(o) === dir) && (!query || (o.number || '').toLowerCase().includes(query) || (o.client?.name || '').toLowerCase().includes(query)));
  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div class="seg" id="tabs">${[['active', 'Активные'], ['issued', 'Выданы'], ['cancelled', 'Отменены']].map(([k, t]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="row" style="gap:8px;align-items:center"><select class="inp" id="odir">${dirs().map(([k, t]) => `<option value="${k}" ${dir === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <input class="inp" id="oq" placeholder="Номер или клиент" value="${esc(query)}" style="min-width:200px"></div>
      </div>
      ${tab === 'active' ? `<div class="row" style="gap:6px;margin-top:12px">${TABS.active.map((s) => `<span class="chip ${STATUS_CHIP[s]}">${counts[s]} ${STATUS[s]}</span>`).join('')}</div>` : ''}
    </div>
    <div class="olist">${list.length ? list.map((o) => `
      <a class="ocard" href="#/order/${o.id}">
        <div class="row" style="gap:10px;align-items:center"><span class="mono">${esc(o.number)}</span><span class="chip ${STATUS_CHIP[o.status]}">${STATUS[o.status]}</span>${o.urgency !== 'standard' ? `<span class="chip ${o.urgency === 'urgent' ? 'bad' : 'warn'} nodot">${URGENCY[o.urgency]}</span>` : ''}</div>
        <div class="sum">${rub(o.total)}</div>
        <div>${esc(o.client?.name || '—')}</div><div></div>
        <div class="muted small">${dirOf(o) === 'poly' ? 'Полиграфия' : 'Широкоформат'} · ${dt(o.created_at)}${o.due_at ? ' · готовность ' + dt(o.due_at) : ''}</div>
      </a>`).join('') : '<div class="card muted">Заказов нет</div>'}</div>`;
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; renderOrders(el); }));
  $('#odir').addEventListener('change', (e) => { dir = e.target.value; renderOrders(el); });
  let t;
  $('#oq').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { query = e.target.value.trim().toLowerCase(); renderOrders(el).then(() => { const i = $('#oq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); });
}
