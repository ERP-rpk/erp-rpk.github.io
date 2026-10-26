// Экран «Зарплата»: начисления за период. Директор видит всех, сотрудник — только себя.
// Начисления пишет база (миграция 013): блоки печати и постпечати, доля срочности, удержания за брак.
import { app, setTitle } from '../app.js?v=f8825c7';
import { $, $$, esc, rub, num, dt, toast, modal, errText, ROLE, numInputs, parseIn } from '../ui.js?v=f8825c7';

const KIND = { piece: 'Сдельно', urgency_bonus: 'Срочность', brak_deduction: 'Удержание за брак', manual: 'Вручную' };
const BLOCK = { PRINT_BLOCK: 'печать', POSTPRINT_BLOCK: 'постпечать' };
const iso = (d) => d.toLocaleDateString('sv');
export function periods() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  return {
    month: ['Этот месяц', iso(new Date(y, m, 1)), iso(now)],
    prev: ['Прошлый месяц', iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
    d30: ['30 дней', iso(new Date(now - 29 * 864e5)), iso(now)],
  };
}
let per = 'month', custom = null;

export async function renderPayroll(el) {
  setTitle('Зарплата');
  const P = periods();
  const [from, to] = per === 'custom' && custom ? custom : P[per].slice(1);
  const all = app.me.perm('see_cost');
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div class="seg" id="per">${Object.entries(P).map(([k, [t]]) => `<button data-p="${k}" class="${per === k ? 'on' : ''}">${t}</button>`).join('')}<button data-p="custom" class="${per === 'custom' ? 'on' : ''}">Период…</button></div>
      <div class="row small" style="gap:6px;align-items:center"><input type="date" id="f" value="${from}"> — <input type="date" id="t" value="${to}"></div></div>
      <div class="muted small" style="margin-top:8px">Сдельно — за выполненный блок: печать (при «Напечатано») и постпечать (при «Готово»). Перепечатка после брака повторно не оплачивается. Доплата за срочность делится, когда заказ готов.</div></div>
    <div id="pay"><div class="muted">Загрузка…</div></div>`;
  $$('#per button').forEach((b) => b.addEventListener('click', () => { per = b.dataset.p; if (per === 'custom') custom = [$('#f').value, $('#t').value]; renderPayroll(el); }));
  ['#f', '#t'].forEach((s) => $(s).addEventListener('change', () => { per = 'custom'; custom = [$('#f').value, $('#t').value]; renderPayroll(el); }));
  const rows = (await app.api.payrollSummary(from, to)).filter((r) => all ? (Number(r.total) || r.piece_rate) : true);
  const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  $('#pay').innerHTML = `<div class="card">${rows.length ? `<table class="t"><thead><tr><th>Сотрудник</th><th>Блоков</th><th style="text-align:right">Сдельно</th><th style="text-align:right">Срочность</th><th style="text-align:right">Удержания</th><th style="text-align:right">Вручную</th><th style="text-align:right">Итого</th>${all ? '<th style="text-align:right">Оклад</th>' : ''}</tr></thead><tbody>
    ${rows.map((r) => `<tr class="pick" data-e="${r.employee_id}"><td><b>${esc(r.full_name)}</b><div class="muted small">${ROLE[r.role] || ''}${r.piece_rate ? '' : ' · без сдельной оплаты'}</div></td>
      <td class="small">печать ${r.print_blocks} · постпечать ${r.post_blocks}</td>
      <td style="text-align:right">${rub(r.piece)}</td><td style="text-align:right">${rub(r.urgency)}</td>
      <td style="text-align:right;color:${Number(r.deductions) < 0 ? 'var(--bad)' : 'inherit'}">${rub(r.deductions)}</td><td style="text-align:right">${rub(r.manual)}</td>
      <td style="text-align:right"><b>${rub(r.total)}</b></td>${all ? `<td style="text-align:right" class="small">${r.salary_rub ? rub(r.salary_rub) : '—'}</td>` : ''}</tr>`).join('')}</tbody>
    ${all && rows.length > 1 ? `<tfoot><tr><td><b>Фонд оплаты</b></td><td></td><td style="text-align:right">${rub(sum('piece'))}</td><td style="text-align:right">${rub(sum('urgency'))}</td><td style="text-align:right">${rub(sum('deductions'))}</td><td style="text-align:right">${rub(sum('manual'))}</td><td style="text-align:right"><b>${rub(sum('total'))}</b></td><td></td></tr></tfoot>` : ''}</table>
    <div class="muted small" style="margin-top:6px">Нажмите на строку — откроются все начисления сотрудника за период.</div>` : '<div class="muted">За период начислений нет</div>'}</div>`;
  $$('#pay [data-e]').forEach((tr) => tr.addEventListener('click', () => details(rows.find((r) => r.employee_id === tr.dataset.e), from, to, () => renderPayroll(el))));
}

async function details(r, from, to, reload) {
  const es = await app.api.payrollEntries(r.employee_id, from, to);
  const can = app.me.perm('settings');
  const m = modal(`<h3>${esc(r.full_name)} · ${new Date(from).toLocaleDateString('ru-RU')} — ${new Date(to).toLocaleDateString('ru-RU')}</h3>
    ${es.length ? `<table class="t"><tbody>${es.map((e) => `<tr><td class="small">${dt(e.created_at)}</td><td class="small">${KIND[e.kind]}${e.block ? ' · ' + BLOCK[e.block] : ''}<div class="muted">${esc(e.comment || '')}</div></td>
      <td class="small" style="text-align:right;white-space:nowrap"><b style="color:${e.amount < 0 ? 'var(--bad)' : 'inherit'}">${rub(e.amount)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="muted">Начислений нет</div>'}
    <div class="total-line" style="margin-top:8px"><span>Итого за период</span><b>${rub(r.total)}</b></div>
    ${can ? `<div class="card" style="background:var(--soft);margin-top:10px"><b class="small">Начисление или удержание вручную</b>
      <div class="grid2" style="margin-top:6px"><div class="field"><label>Сумма, ₽ (удержание — со знаком минус)</label><input id="ma" inputmode="decimal" data-num></div>
      <div class="field"><label>За что</label><input id="mc" placeholder="премия, аванс, штраф…"></div></div>
      <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn primary" id="madd">Добавить</button></div></div>` : ''}
    <div class="acts"><button class="btn" id="close">Закрыть</button></div>`, { wide: true });
  numInputs(m.el);
  m.el.querySelector('#close').addEventListener('click', m.close);
  m.el.querySelector('#madd')?.addEventListener('click', async () => {
    const a = Number(parseIn(m.el.querySelector('#ma').value)), c = m.el.querySelector('#mc').value.trim();
    if (!a || isNaN(a) || !c) return toast('Укажите сумму и за что', 'bad');
    try { await app.api.addPayrollEntry(r.employee_id, a, c); m.close(); toast('Добавлено'); reload(); } catch (e) { toast(errText(e), 'bad'); }
  });
}
