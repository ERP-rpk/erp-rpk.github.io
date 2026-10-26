// Экран «Отчёт директора» за период, со сравнением с предыдущим таким же периодом.
// Все суммы считает база (director_report, миграция 013); здесь только показ.
import { app, setTitle } from '../app.js?v=f8825c7';
import { $, $$, esc, rub, num, toast } from '../ui.js?v=f8825c7';

const iso = (d) => d.toLocaleDateString('sv');
const day = 864e5;
const PER = { d1: ['Сегодня', 1], d7: ['7 дней', 7], d30: ['30 дней', 30], d90: ['90 дней', 90] };
let per = 'd30';

function range(days) {
  const to = new Date(), from = new Date(+to - (days - 1) * day);
  const pto = new Date(+from - day), pfrom = new Date(+pto - (days - 1) * day);
  return { from: iso(from), to: iso(to), pfrom: iso(pfrom), pto: iso(pto), days };
}
const pct = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
const INK = { C: 'Голубой', M: 'Пурпурный', Y: 'Жёлтый', K: 'Чёрный', solvent: 'Сольвент' };

export async function renderReport(el) {
  setTitle('Отчёт');
  const R = range(PER[per][1]);
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div class="seg" id="per">${Object.entries(PER).map(([k, [t]]) => `<button data-p="${k}" class="${per === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="muted small">${new Date(R.from).toLocaleDateString('ru-RU')} — ${new Date(R.to).toLocaleDateString('ru-RU')} · сравнение с ${PER[per][1] === 1 ? 'вчера' : 'предыдущими ' + PER[per][1] + ' днями'}</div></div></div>
    <div id="rep"><div class="muted">Загрузка…</div></div>`;
  $$('#per button').forEach((b) => b.addEventListener('click', () => { per = b.dataset.p; renderReport(el); }));
  let cur, prev;
  try { [cur, prev] = await Promise.all([app.api.directorReport(R.from, R.to), app.api.directorReport(R.pfrom, R.pto)]); }
  catch (e) { $('#rep').innerHTML = `<div class="alert bad">${esc(e.message || String(e))}</div>`; return; }
  draw($('#rep'), cur, prev, R);
}

function kpi(title, val, prevVal, fmt = rub, sub = '', goodUp = true) {
  const d = pct(Number(val), Number(prevVal));
  const col = d == null || d === 0 ? 'var(--muted)' : (d > 0) === goodUp ? 'var(--ok)' : 'var(--bad)';
  return `<div class="card kpi" style="margin:0"><div class="muted small">${title}</div><div style="font-size:24px;font-weight:800;margin-top:4px">${fmt(Number(val))}</div>
    <div class="small" style="color:${col}">${d == null ? 'нет данных для сравнения' : (d > 0 ? '+' : '') + d + '% к прошлому периоду'}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
}

function draw(box, c, p, R) {
  const t = c.totals, pt = p.totals;
  const avg = t.orders ? t.revenue / t.orders : 0;
  const afterAll = Number(t.margin) - Number(t.tax) - Number(c.amortization) - c.payments.reduce((a, x) => a + Number(x.fee), 0) - Number(c.payroll.total);
  box.innerHTML = `
    <div class="kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px">
      ${kpi('Выручка', t.revenue, pt.revenue)}
      ${kpi('Маржа', t.margin, pt.margin, rub, t.revenue ? 'это ' + num((t.margin / t.revenue) * 100, 0) + '% выручки' : '')}
      ${kpi('Заказов', t.orders, pt.orders, (v) => num(v, 0), 'средний чек ' + rub(avg))}
      ${kpi('Напечатано', c.sqm.printed, p.sqm.printed, (v) => num(v, 1) + ' м²', 'перерасход ' + num(c.sqm.waste, 1) + ' м² · ' + rub(t.waste_rub))}
      ${kpi('Брак', c.brak.mm, p.brak.mm, (v) => num(v, 0) + ' мм', c.brak.count + ' шт · себестоимость ' + rub(c.brak.cost), false)}
    </div>
    <div class="card"><h2>Выручка по дням</h2><div class="muted small" style="margin-bottom:8px">Наведите на столбец, чтобы увидеть сумму</div>${dayChart(c.by_day, R)}</div>
    <div class="grid2" style="align-items:start">
      <div class="card"><h2>Прибыль за период</h2>
        ${line('Выручка', t.revenue)}${line('Себестоимость (материал, чернила, голова, материалы услуг)', -t.cost)}${line('Маржа', t.margin, true)}
        ${line('Налог УСН ' + num(app.refs.settings.tax_usn_pct) + '%', -t.tax)}
        ${line('Комиссии за оплату', -c.payments.reduce((a, x) => a + Number(x.fee), 0))}
        ${line('Сдельная оплата и доплаты сотрудникам', -c.payroll.total)}
        ${line('Амортизация принтеров', -c.amortization)}
        ${line('Остаётся компании', afterAll, true)}
        <div class="muted small" style="margin-top:6px">Оклады, аренда и прочие расходы сюда пока не входят.</div></div>
      <div class="card"><h2>Скидки и срочность</h2>
        ${line('Скидок отдали', t.discounts)}${line('Доля скидок от выручки', null, false, t.revenue ? num((t.discounts / t.revenue) * 100, 1) + '%' : '—')}
        ${line('Скидок выше лимита подтвердил директор', null, false, num(t.approved_discounts, 0) + ' зак.')}
        ${line('Доплаты за срочность', t.urgency)}${line('Срочных и экспресс', null, false, num(t.urgent_orders, 0) + ' зак.')}
        <h2 style="margin-top:14px">Оплаты</h2>${c.payments.length ? c.payments.map((x) => line(esc(x.method), x.amount, false, null, x.fee ? 'комиссия ' + rub(x.fee) : '')).join('') : '<div class="muted small">Оплат за период нет</div>'}</div>
    </div>
    <div class="card"><h2>По материалам</h2>${c.by_category.length ? `<table class="t"><thead><tr><th>Материал</th><th>Позиций</th><th>Печать, м²</th><th>Перерасход, м²</th><th>Брак, мм</th><th style="text-align:right">Выручка</th><th style="text-align:right">Себест.</th><th style="text-align:right">Маржа</th></tr></thead><tbody>
      ${c.by_category.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.items}</td><td>${num(x.printed_sqm, 1)}</td><td>${num(x.waste_sqm, 1)} <span class="muted small">${x.printed_sqm + x.waste_sqm ? num((x.waste_sqm / (x.printed_sqm + x.waste_sqm)) * 100, 0) + '%' : ''}</span></td><td>${num(x.brak_mm, 0)}</td>
        <td style="text-align:right">${rub(x.revenue)}</td><td style="text-align:right">${rub(x.cost)}</td><td style="text-align:right"><b>${rub(x.revenue - x.cost)}</b></td></tr>`).join('')}</tbody></table>
      <div class="muted small" style="margin-top:6px">Выручка по материалу — до скидки.</div>` : '<div class="muted small">Заказов нет</div>'}</div>
    <div class="grid2" style="align-items:start">
      <div class="card"><h2>По менеджерам</h2>${c.by_manager.length ? `<table class="t"><thead><tr><th>Менеджер</th><th>Заказов</th><th style="text-align:right">Выручка</th><th style="text-align:right">Маржа</th><th style="text-align:right">Скидки</th></tr></thead><tbody>
        ${c.by_manager.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.orders}</td><td style="text-align:right">${rub(x.revenue)}</td><td style="text-align:right">${rub(x.margin)}</td><td style="text-align:right">${rub(x.discounts)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small">Заказов нет</div>'}</div>
      <div class="card"><h2>Брак и начисления</h2>
        ${line('Брак, всего', c.brak.cost, false, null, `${c.brak.count} шт · ${num(c.brak.mm, 0)} мм`)}
        ${line('— по вине печатников (удержано)', c.brak.printer)}${line('— технический', c.brak.tech)}${c.brak.review ? line('— ждёт решения', c.brak.review) : ''}
        <div style="height:8px"></div>
        ${line('Сдельно', c.payroll.piece)}${line('Доплаты за срочность', c.payroll.urgency)}${line('Удержания', c.payroll.deductions)}${line('Фонд оплаты', c.payroll.total, true)}
        <a class="btn sm" href="#/payroll" style="margin-top:8px">Зарплата по сотрудникам →</a></div>
    </div>
    <div class="grid2" style="align-items:start">
      <div class="card"><h2>Цех сейчас</h2>${line('В очереди позиций', null, false, num(c.workshop.queue, 0))}${line('В работе позиций', null, false, num(c.workshop.in_work, 0))}
        ${line('Заказов готово к выдаче', null, false, num(c.workshop.ready_orders, 0))}${line('Заказов просрочено', null, false, `<b style="color:${c.workshop.overdue ? 'var(--bad)' : 'inherit'}">${num(c.workshop.overdue, 0)}</b>`)}</div>
      <div class="card"><h2>Чернила</h2>${c.ink.length ? c.ink.map((x) => line(INK[x.channel] || x.channel, null, false, x.sqm ? num(x.ml / x.sqm, 1) + ' мл/м²' : '—', x.rub && x.sqm ? rub(x.rub / x.sqm) + ' на 1 м²' : '')).join('') : '<div class="muted small">Нет закрытых периодов по бутылкам за этот срок. Отмечайте вскрытие бутылок на складе.</div>'}</div>
    </div>`;
  bindChart(box);
}

function line(label, value, bold = false, text = null, sub = '') {
  const v = text != null ? text : rub(Number(value) || 0); // без «−0 ₽»
  return `<div class="total-line${bold ? '' : ' small'}"><span>${label}${sub ? `<div class="muted small">${sub}</div>` : ''}</span><span>${bold ? `<b>${v}</b>` : v}</span></div>`;
}

// Один ряд — выручка по дням: тонкие столбцы одного цвета, скруглённый верх, подсказка при наведении.
function dayChart(byDay, R) {
  const map = new Map(byDay.map((d) => [d.day, d]));
  const days = [];
  for (let d = new Date(R.from); iso(d) <= R.to; d = new Date(+d + day)) days.push(iso(d));
  const max = Math.max(1, ...days.map((d) => Number(map.get(d)?.revenue || 0)));
  const W = 760, H = 180, padL = 56, padB = 22, gap = 2;
  const bw = Math.max(2, (W - padL) / days.length - gap);
  const y = (v) => H - padB - (v / max) * (H - padB - 10);
  const ticks = [0, max / 2, max];
  const fmtK = (v) => (v >= 1000 ? num(v / 1000, v >= 10000 ? 0 : 1) + ' тыс' : num(v, 0));
  const bars = days.map((d, i) => {
    const r = map.get(d), v = Number(r?.revenue || 0), x = padL + i * (bw + gap), wd = new Date(d).getDay();
    const h = Math.max(0, H - padB - y(v));
    return `<g class="bar" data-tip="${new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })}|${rub(v)}|${r ? 'заказов ' + r.orders + ' · маржа ' + rub(r.margin) : 'заказов нет'}">
      <rect x="${x - gap / 2}" y="10" width="${bw + gap}" height="${H - padB - 10}" fill="transparent"/>
      ${h > 0 ? `<path d="M${x},${H - padB} v${-Math.max(h - 4, 0)} q0,-4 4,-4 h${bw - 8 > 0 ? bw - 8 : 0} q4,0 4,4 v${Math.max(h - 4, 0)} z" fill="var(--blue)" opacity="${wd === 0 || wd === 6 ? 0.55 : 1}"/>` : ''}</g>`;
  }).join('');
  const labelsEvery = Math.ceil(days.length / 8);
  return `<div class="chartwrap" style="position:relative"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Выручка по дням">
    ${ticks.map((v) => `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtK(v)}</text>`).join('')}
    ${bars}
    ${days.map((d, i) => (i % labelsEvery === 0 ? `<text x="${padL + i * (bw + gap) + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' })}</text>` : '')).join('')}
  </svg><div class="tip" style="position:absolute;display:none;pointer-events:none;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.08)"></div></div>
  <div class="muted small">Бледнее — выходные дни.</div>`;
}

function bindChart(box) {
  const wrap = box.querySelector('.chartwrap'); if (!wrap) return;
  const tip = wrap.querySelector('.tip');
  wrap.querySelectorAll('.bar').forEach((g) => {
    g.addEventListener('mouseenter', (e) => {
      const [d, v, s] = g.dataset.tip.split('|');
      tip.innerHTML = `<div class="muted">${esc(d)}</div><b>${esc(v)}</b><div class="muted">${esc(s)}</div>`; tip.style.display = '';
    });
    g.addEventListener('mousemove', (e) => { const r = wrap.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 170) + 'px'; tip.style.top = (e.clientY - r.top - 10) + 'px'; });
    g.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    g.addEventListener('click', () => toast(g.dataset.tip.split('|').join(' · ')));
  });
}
