// Экран «Цех»: очередь печатника по рулонам, без цен и клиентов. Крупные кнопки шагов.
import { app, setTitle } from '../app.js?v=f8825c7';
import { $$, esc, num, dt, toast, modal, errText, numInputs, parseIn, roundHint, ITEM_STATUS, URGENCY } from '../ui.js?v=f8825c7';
import { schemeSvg, layoutText } from '../scheme.js?v=f8825c7';
import { makeCtx } from '../calc-ctx.js?v=f8825c7';
import { itemSizes, fitOffcuts } from '../calc-core.js?v=f8825c7';

// Подходящие свободные обрезки для позиции на рулоне: вся позиция целиком, без раскроя.
// Обрезки, уже выбранные для других позиций в очереди, не предлагаются.
function offcutsFor(r, taken) {
  if (r.offcut_id || !['queue', 'print'].includes(r.item_status) || r.layout?.split || r.options?.raskroy) return [];
  const cat = app.refs.categories.find((c) => c.id === r.category_id);
  if (!cat) return [];
  try {
    const ctx = makeCtx(app.refs, cat, app.refs.printers[0]);
    const sizes = { ...itemSizes({ widthMm: r.width_mm, lengthMm: r.length_mm, frameMm: r.frame_mm, options: r.options || {} }, ctx.settings), frameMm: r.frame_mm };
    return fitOffcuts(sizes, r.qty, ctx.category, ctx.printer, ctx.offcuts.filter((o) => !taken.has(o.id)), ctx.settings);
  } catch { return []; }
}

const NEXT = { queue: ['print', 'В печать'], print: ['printed', 'Напечатано'], printed: ['post', 'Постобработка'], post: ['ready', 'Готово'] };
const OPT_NAME = (code) => app.refs.options.find((o) => o.code === code)?.name || ({ raskroy: 'Раскрой' }[code] || code);

function optText(options) {
  return Object.entries(options || {}).map(([k, v]) => {
    let s = OPT_NAME(k);
    if (v && typeof v === 'object') {
      if (v.step) s += ` шаг ${v.step}`;
      if (v.sides) s += ` (${v.sides.map((x) => ({ top: 'верх', bottom: 'низ', left: 'лево', right: 'право' }[x])).join(', ')})`;
    }
    return s;
  }).join(' · ') || 'без обработки';
}

export async function renderWorkshop(el) {
  setTitle('Цех');
  const rows = await app.api.workshopQueue();
  const groups = [];
  for (const r of rows) {
    let g = groups.find((x) => x.name === r.roll_group);
    if (!g) groups.push(g = { name: r.roll_group, items: [] });
    g.items.push(r);
  }
  const printer = makeCtx(app.refs, app.refs.categories[0], app.refs.printers[0]).printer;
  const taken = new Set(rows.map((x) => x.offcut_id).filter(Boolean));
  const inkBtn = `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><a class="btn sm" href="#/stock">Чернила: открыта бутылка / снята отработка</a></div>`;
  el.innerHTML = inkBtn + (groups.length ? groups.map((g) => `
    <div class="group">
      <h3>${esc(g.name)} <span class="chip nodot">${g.items.length} ${g.items.length === 1 ? 'макет' : g.items.length < 5 ? 'макета' : 'макетов'}</span></h3>
      ${g.items.map((r) => `
        <div class="job">
          <div>
            <div class="row" style="gap:8px;align-items:center"><span class="mono">${esc(r.number)}</span>
              ${r.urgency !== 'standard' ? `<span class="chip ${r.urgency === 'urgent' ? 'bad' : 'warn'} nodot">${URGENCY[r.urgency]}</span>` : ''}
              <span class="chip">${ITEM_STATUS[r.item_status]}</span>
              <span class="muted small">поз. ${r.item_position}${r.due_at ? ' · к ' + dt(r.due_at) : ''}</span></div>
            <div class="big" style="margin-top:6px">${num(r.width_mm, 0)}×${num(r.length_mm, 0)} мм · ${r.qty} шт</div>
            <div class="small">${esc(r.material || r.category)} · ${r.offcut_id ? `<span class="chip violet nodot">на обрезке ${num(r.offcut_w_mm, 0)}×${num(r.offcut_l_mm, 0)} мм</span> от рулона <b>${esc(r.roll_article || '—')}</b>` : `рулон <b>${esc(r.roll_article || '—')}</b>`} · белое поле ${r.frame_mm} мм</div>
            ${(() => {
              const fit = offcutsFor(r, taken)[0];
              if (fit) return `<div class="alert ok small" style="margin:6px 0">Подходит обрезок <b>${num(fit.widthMm, 0)}×${num(fit.lengthMm, 0)} мм</b> от рулона <b class="mono">${esc(fit.article)}</b> — рулон не тратится
                <button class="btn sm" data-useoc="${r.item_id}" data-oc="${fit.id}" style="margin-left:8px">Печатать на обрезке</button></div>`;
              if (r.offcut_id && ['queue', 'print'].includes(r.item_status)) return `<button class="btn sm" data-useoc="${r.item_id}" data-oc="" style="margin:6px 0">Вернуть на рулон</button>`;
              return '';
            })()}
            ${r.brak_count ? `<div class="small" style="color:var(--bad)">Перепечатка после брака${r.brak_count > 1 ? ' · ' + r.brak_count + ' раза' : ''}</div>` : ''}
            <div class="small muted">${esc(optText(r.options))}</div>
            ${r.layout ? `<div class="small muted">${layoutText(r.layout)}</div><details><summary class="small" style="cursor:pointer">Схема</summary>${schemeSvg({ layout: r.layout, qty: r.qty }, printer)}</details>` : ''}
          </div>
          <div class="acts">${NEXT[r.item_status] ? `<button class="btn ${r.item_status === 'post' ? 'primary' : 'dark'}" data-it="${r.item_id}" data-s="${NEXT[r.item_status][0]}">${NEXT[r.item_status][1]}</button>` : ''}
            ${r.item_status === 'print' ? `<button class="btn sm" data-back="${r.item_id}" title="Нажали «В печать» по ошибке">← В очередь</button>` : ''}
            ${r.item_status !== 'queue' ? `<button class="btn sm bad" data-brak="${r.item_id}">Брак</button>` : ''}</div>
        </div>`).join('')}
    </div>`).join('') : '<div class="card muted">Очередь пуста. Новые заказы появятся здесь после согласования макета.</div>');
  $$('[data-it]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const r = rows.find((x) => x.item_id === b.dataset.it);
    try {
      await app.api.setItemStatus(b.dataset.it, b.dataset.s);
      toast('Отмечено: ' + ITEM_STATUS[b.dataset.s]);
      // после печати на рулоне — сохранить остаток, если материал из тех, чьи обрезки храним
      if (b.dataset.s === 'printed' && !r.offcut_id && r.offcut_min_w_mm && r.roll_id) return offcutAfterPrint(r, () => renderWorkshop(el));
    } catch (e) { toast(errText(e), 'bad'); }
    renderWorkshop(el);
  }));
  $$('[data-useoc]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await app.api.useOffcut(b.dataset.useoc, b.dataset.oc || null); toast(b.dataset.oc ? 'Позиция печатается на обрезке' : 'Позиция снова на рулоне'); }
    catch (e) { toast(errText(e), 'bad'); }
    app.refs = await app.api.refs(); renderWorkshop(el);
  }));
  $$('[data-back]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await app.api.setItemStatus(b.dataset.back, 'queue'); toast('Позиция вернулась в очередь'); } catch (e) { toast(errText(e), 'bad'); }
    renderWorkshop(el);
  }));
  $$('[data-brak]').forEach((b) => b.addEventListener('click', () => brakDialog(rows.find((x) => x.item_id === b.dataset.brak), () => renderWorkshop(el))));
}

function offcutAfterPrint(r, done) {
  const m = modal(`<h3>Остался кусок материала?</h3>
    <div class="muted small">Сохраняем обрезки от ${r.offcut_min_w_mm}×${r.offcut_min_l_mm} мм (в любой ориентации). Ширина рулона — ${num(r.roll_width_mm, 0)} мм. Подпишите кусок артикулом рулона <b class="mono">${esc(r.roll_article || '')}</b>.</div>
    <div class="grid2" style="margin-top:10px"><div class="field"><label>Ширина, мм</label><input id="ow" inputmode="numeric" data-num value="${r.roll_width_mm || ''}"></div>
      <div class="field"><label>Длина, мм</label><input id="ol" inputmode="numeric" data-num></div></div>
    <div class="acts"><button class="btn" id="no">Нет обрезка</button><button class="btn primary" id="yes">Сохранить обрезок</button></div>`);
  numInputs(m.el); roundHint(m.el, '#ow, #ol', 'down');
  m.el.querySelector('#no').addEventListener('click', () => { m.close(); done(); });
  m.el.querySelector('#yes').addEventListener('click', async () => {
    try {
      await app.api.addOffcut(r.roll_id, Math.round(Number(parseIn(m.el.querySelector('#ow').value))), Math.round(Number(parseIn(m.el.querySelector('#ol').value))), r.item_id);
      m.close(); toast('Обрезок сохранён'); app.refs = await app.api.refs(); done();
    } catch (e) { toast(errText(e), 'bad'); }
  });
}

const BRAK_REASONS = ['полосит', 'забились дюзы', 'не тот цвет', 'смазалось / капли', 'замяло материал', 'ошибка в макете', 'другое'];
function brakDialog(r, done) {
  const m = modal(`<h3>Брак · ${esc(r.number)}, поз. ${r.item_position}</h3>
    <div class="muted small">Брак случается — это ошибка, на которой мы учимся. Главное — разобрать её: почему так вышло и как не допустить в следующий раз.</div>
    <div class="field" style="margin-top:10px"><label>Испорчено, мм</label><input id="bm" inputmode="numeric" data-num style="max-width:160px">
      <div class="muted small">${r.offcut_id ? 'Печатали на обрезке — спишется испорченный обрезок, с рулона ничего.' : 'Спишется с рулона ' + esc(r.roll_article || '') + '.'} Менеджер или директор решат, чей брак.</div></div>
    <div class="field" style="margin-top:8px"><label>Причина</label><div class="row" style="gap:6px;flex-wrap:wrap" id="rs">${BRAK_REASONS.map((t) => `<button type="button" class="btn sm" data-r="${t}">${t}</button>`).join('')}</div></div>
    <div class="field" style="margin-top:8px"><label>Что случилось</label><input id="bc" placeholder="например, не включили вакуум"></div>
    <div class="field" style="margin-top:8px"><label>Вывод: как избежать в дальнейшем</label><textarea id="bl" rows="2" placeholder="например, перед печатью проверять, что вакуум включён"></textarea></div>
    <div style="margin-top:8px"><label class="toggle on" id="rp"><span class="sw"></span>Вернуть позицию в печать (перепечатка не оплачивается повторно)</label></div>
    <div class="acts"><button class="btn" id="c">Отмена</button><button class="btn bad" id="s">Записать брак</button></div>`);
  numInputs(m.el); roundHint(m.el, '#bm', 'up');
  let reason = '';
  m.el.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { reason = b.dataset.r; m.el.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('primary', x === b)); }));
  m.el.querySelector('#rp').addEventListener('click', (e) => e.currentTarget.classList.toggle('on'));
  m.el.querySelector('#c').addEventListener('click', m.close);
  m.el.querySelector('#s').addEventListener('click', async () => {
    const mm = Math.round(Number(parseIn(m.el.querySelector('#bm').value)));
    try {
      await app.api.reportBrak(r.item_id, mm, reason, m.el.querySelector('#bc').value.trim(), m.el.querySelector('#bl').value.trim(), m.el.querySelector('#rp').classList.contains('on'));
      m.close(); toast('Брак записан'); done();
    } catch (e) { toast(errText(e), 'bad'); }
  });
}
