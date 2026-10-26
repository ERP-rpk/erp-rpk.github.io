// Экран «Полиграфия»: типография на ризографе — бланки из каталога и журналы/книги, заказ из нескольких позиций.
// Сделан по утверждённому прототипу prototype/polygraphy.html; расчёт — web/js/poly-core.js (миграция 020).
import { app, setTitle } from '../app.js?v=f8825c7';
import { $, $$, esc, rub, num, toast, modal, errText, URGENCY, numInputs, parseIn } from '../ui.js?v=f8825c7';
import { polySettings, calcBlank, calcBook, coilHint, polyOrder, risoJobs, FORMATS, PAPER_IDS, BIND, HOLES } from '../poly-core.js?v=f8825c7';

const rubK = (n) => (n == null || isNaN(n) ? '—' : (Math.round(n * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽');
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
const DEF_SECTION = () => ({ name: 'Наполнение', sheets: 100, color: '1+1', paper: 'off65' });

let st = null;        // состояние экрана
let catalog = [];     // каталог бланков и журналов (действующие версии)

const newBlank = () => ({ kind: 'blank', blankId: null, title: '', q: '', fmt: 'A4', color: '1+0', qty: 1000, paper: 'news49' });
const newBook = () => ({ kind: 'book', blankId: null, title: '', books: 1, frontNoPrint: false, spread: false, sections: [DEF_SECTION()], bind: 'staple', holes: 'round', coil: null });
const fresh = () => ({ dir: 'typo', items: [newBlank()], cur: 0, urgency: 'standard', discountPct: 0 });
const S = () => polySettings(app.refs.settings);
const cur = () => st.items[st.cur];
const catRow = (id) => catalog.find((c) => c.id === id);

// параметры для расчёта книги (ключ секций — номер журнала, чтобы одинаковые макеты считались одним тиражом)
const bookParams = (it) => ({ id: it.blankId || 'custom', sections: it.sections, bind: it.bind, holes: it.holes, coil: it.coil, spread: it.spread, frontNoPrint: it.frontNoPrint });
const titleOf = (it) => {
  const c = catRow(it.blankId);
  if (c) return `${c.code} · ${c.name}`;
  return it.title.trim() || (it.kind === 'blank' ? 'Бланк без каталога' : 'Нестандартный журнал');
};
function calcIt(it, s = S()) {
  return it.kind === 'blank' ? calcBlank(it.qty, it, s) : calcBook(it.books, bookParams(it), s);
}
function compute() {
  const s = S();
  const res = st.items.map((it) => calcIt(it, s));
  return { s, res, o: polyOrder(res, { discountPct: st.discountPct, urgency: st.urgency, role: app.me.role }, s) };
}

export async function renderPoly(el) {
  setTitle('Полиграфия');
  if (!st) st = fresh();
  catalog = await app.api.blankCatalog().catch(() => []);
  el.innerHTML = `<div class="card" style="padding:10px"><div class="row" style="justify-content:space-between;gap:8px">
      <div class="seg" id="pDir"><button data-d="typo" class="${st.dir === 'typo' ? 'on' : ''}">Типография</button><button data-d="digital" class="${st.dir === 'digital' ? 'on' : ''}">Визитки, этикетки, листовки</button></div>
      ${st.dir === 'typo' ? `<div class="seg" id="pMode"><button data-m="blank" class="${cur().kind === 'blank' ? 'on' : ''}">Бланки</button><button data-m="book" class="${cur().kind === 'book' ? 'on' : ''}">Журнал / книга</button></div>` : ''}
    </div></div>
    <div class="calc" style="margin-top:14px"><div id="pLeft"></div><div id="pRight"></div></div>`;
  $$('#pDir button').forEach((b) => b.addEventListener('click', () => { st.dir = b.dataset.d; renderPoly(el); }));
  $$('#pMode button').forEach((b) => b.addEventListener('click', () => {
    if (cur().kind === b.dataset.m) return;
    st.items[st.cur] = b.dataset.m === 'blank' ? newBlank() : newBook();
    renderPoly(el);
  }));
  if (st.dir === 'digital') {
    $('#pLeft').innerHTML = '<div class="card"><h2>Визитки, этикетки, листовки</h2><div class="muted">Цифровая печать на листах SRA3 с резкой. Расчёт добавим следующим шагом — пока он ведётся вручную в таблице «Цена ВИЗИТКИ / этикетки / листовки».</div></div>';
    $('#pRight').innerHTML = '';
    return;
  }
  drawLeft(el);
  drawRight(el);
}

// ---------------------------------------------------------------- левая колонка
function drawLeft(el) {
  const it = cur();
  const canDiscount = app.me.perm('give_discount') && app.me.role !== 'agent';
  const head = `<div class="card"><div class="row" style="justify-content:space-between;align-items:center">
      <h2 style="margin:0">Позиция ${st.cur + 1}${st.items.length > 1 ? ` из ${st.items.length}` : ''}</h2>
      <div class="row" style="gap:6px">${st.items.length > 1 ? st.items.map((x, i) => `<button class="btn sm ${i === st.cur ? 'dark' : ''}" data-pos="${i}" title="${esc(titleOf(x))}">${i + 1}</button>`).join('') : ''}
        <button class="btn sm" id="pAdd">+ позиция</button>${st.items.length > 1 ? '<button class="btn sm bad" id="pDel">Убрать</button>' : ''}</div></div>
      <div class="muted small" style="margin-top:6px">В одном заказе может быть несколько бланков и журналов — скидка и срочность общие.</div></div>`;
  const urg = `<div class="card"><h2>Срочность и скидка</h2>
      <div class="seg urg" id="pUrg">${Object.entries(URGENCY).map(([k, t]) => `<button data-u="${k}" class="${k} ${st.urgency === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="muted small" style="margin-top:6px">Экспресс — в течение дня, Срочно — в течение 3 часов. Срочность обнуляет скидку.</div>
      ${canDiscount ? `<div class="row" style="margin-top:12px"><div class="field" style="width:140px"><label for="pDisc">Скидка, %</label><input id="pDisc" inputmode="decimal" value="${st.discountPct || ''}" ${st.urgency !== 'standard' ? 'disabled' : ''}></div></div>` : ''}</div>`;
  $('#pLeft').innerHTML = head + (it.kind === 'blank' ? blankHtml(it) : bookHtml(it)) + urg;
  numInputs($('#pLeft'));

  const redraw = () => { drawLeft(el); drawRight(el); };
  $$('[data-pos]').forEach((b) => b.addEventListener('click', () => { st.cur = Number(b.dataset.pos); renderPoly(el); }));
  $('#pAdd').addEventListener('click', () => { st.items.push(it.kind === 'blank' ? newBlank() : newBook()); st.cur = st.items.length - 1; renderPoly(el); });
  $('#pDel')?.addEventListener('click', () => { st.items.splice(st.cur, 1); st.cur = Math.max(0, st.cur - 1); renderPoly(el); });
  $$('#pUrg button').forEach((b) => b.addEventListener('click', () => { st.urgency = b.dataset.u; redraw(); }));
  $('#pDisc')?.addEventListener('input', (e) => { st.discountPct = Math.max(0, Math.min(100, Number(parseIn(e.target.value)) || 0)); drawRight(el); });
  const intIn = (id, fn) => $('#' + id)?.addEventListener('input', (e) => { fn(Math.max(1, Math.round(Number(parseIn(e.target.value)) || 1))); drawRight(el); });

  if (it.kind === 'blank') {
    $('#pQ').addEventListener('input', (e) => { const pos = e.target.selectionStart; it.q = e.target.value; drawLeft(el); const i = $('#pQ'); i.focus(); i.setSelectionRange(pos, pos); });
    $$('#pCat [data-id]').forEach((j) => j.addEventListener('click', () => { const c = catRow(j.dataset.id); Object.assign(it, { blankId: c.id, fmt: c.fmt, color: c.color }); redraw(); }));
    $('#pUnpick')?.addEventListener('click', () => { it.blankId = null; redraw(); });
    $('#pTitle')?.addEventListener('input', (e) => { it.title = e.target.value; drawRight(el); });
    $$('#pFmt button').forEach((b) => b.addEventListener('click', () => { it.fmt = b.dataset.f; redraw(); }));
    $$('#pCol button').forEach((b) => b.addEventListener('click', () => { it.color = b.dataset.c; redraw(); }));
    intIn('pQty', (v) => { it.qty = v; });
    $('#pPaper').addEventListener('change', (e) => { it.paper = e.target.value; drawRight(el); });
    return;
  }
  $('#pBook').addEventListener('change', (e) => {
    const c = catRow(e.target.value);
    it.blankId = c?.id || null;
    it.sections = (c?.book_sections?.length ? c.book_sections : [DEF_SECTION()]).map((x) => ({ name: x.name || 'Наполнение', sheets: Number(x.sheets) || 1, color: x.color === '1+0' ? '1+0' : '1+1', paper: PAPER_IDS[x.paper] ? x.paper : 'off65' }));
    redraw();
  });
  $('#pBtitle')?.addEventListener('input', (e) => { it.title = e.target.value; drawRight(el); });
  intIn('pBooks', (v) => { it.books = v; });
  $('#pFront').addEventListener('click', () => { it.frontNoPrint = !it.frontNoPrint; redraw(); });
  $('#pBind').addEventListener('change', (e) => { it.bind = e.target.value; it.coil = null; redraw(); });
  $$('#pHoles button').forEach((b) => b.addEventListener('click', () => { it.holes = b.dataset.h; redraw(); }));
  $('#pCoil')?.addEventListener('change', (e) => { it.coil = Number(e.target.value); drawRight(el); });
  $('#pSpread').addEventListener('click', () => { it.spread = !it.spread; redraw(); });
  $('#pSecAdd').addEventListener('click', () => { it.sections.push({ name: 'Приложение', sheets: 10, color: '1+0', paper: 'off65' }); redraw(); });
  $$('#pSecs .sec').forEach((box) => {
    const s = it.sections[box.dataset.i];
    box.querySelector('.s-name').addEventListener('input', (e) => { s.name = e.target.value; drawRight(el); });
    box.querySelector('.s-sheets').addEventListener('input', (e) => { s.sheets = Math.max(1, Math.round(Number(parseIn(e.target.value)) || 1)); drawRight(el); });
    box.querySelector('.s-paper').addEventListener('change', (e) => { s.paper = e.target.value; drawRight(el); });
    box.querySelectorAll('.s-color button').forEach((b) => b.addEventListener('click', () => { s.color = b.dataset.c; redraw(); }));
    box.querySelector('.s-del').addEventListener('click', () => { it.sections.splice(box.dataset.i, 1); redraw(); });
  });
}

const colorSeg = (id, cls, val) => `<div class="seg ${cls}" ${id ? `id="${id}"` : ''}>${['1+0', '1+1'].map((c) => `<button data-c="${c}" class="${val === c ? 'on' : ''}">${c === '1+0' ? '1+0 одна сторона' : '1+1 две стороны'}</button>`).join('')}</div>`;
const tog = (id, on, text) => `<span class="toggle ${on ? 'on' : ''}" id="${id}" role="switch" aria-checked="${on}" tabindex="0"><span class="sw"></span>${text}</span>`;

function blankHtml(it) {
  const q = it.q.trim().toLowerCase();
  const found = catalog.filter((c) => c.kind === 'Б' && (!q || `${c.code} ${c.name} ${c.old_number || ''} ${c.client_name || ''}`.toLowerCase().includes(q))).slice(0, 10);
  const c = catRow(it.blankId), F = FORMATS[it.fmt];
  return `<div class="card"><h2>Бланк из каталога</h2>
      <div class="field"><label for="pQ">Поиск: номер, старый номер, название или заказчик</label><input id="pQ" value="${esc(it.q)}" autocomplete="off"></div>
      <div id="pCat" style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${c
        ? `<div class="job on"><span><b class="mono">${esc(c.code)}</b> · ${esc(c.name)}${c.for_client ? `<div class="muted small">под заказчика: ${esc(c.client_name || '')}</div>` : ''}</span><button class="btn sm" id="pUnpick">Другой</button></div>`
        : found.map((x) => `<div class="job" data-id="${x.id}"><span><b class="mono">${esc(x.code)}</b> · ${esc(x.name)}${x.old_number ? ` <span class="muted small">(${esc(x.old_number)})</span>` : ''}${x.for_client ? `<div class="muted small">под заказчика: ${esc(x.client_name || '')}</div>` : ''}</span><span class="chip nodot">${FORMATS[x.fmt]?.name || x.fmt} · ${x.color}</span></div>`).join('')
          || `<div class="muted small">${catalog.some((x) => x.kind === 'Б') ? 'Ничего не найдено.' : 'Каталог бланков пока пуст — его заполнят после переноса старой таблицы.'}</div>`}</div>
      ${c ? '' : `<div class="field" style="margin-top:10px"><label for="pTitle">Нет в каталоге — название бланка</label><input id="pTitle" value="${esc(it.title)}" placeholder="например, Талон на приём к врачу"></div>`}
      <div class="muted small" style="margin-top:6px">Показываются только действующие версии. Формат и печать подставляются из карточки бланка.</div></div>
    <div class="card"><h2>Параметры</h2>
      <div class="row"><div class="field"><label>Формат</label><div class="seg" id="pFmt">${Object.entries(FORMATS).map(([k, f]) => `<button data-f="${k}" class="${it.fmt === k ? 'on' : ''}">${f.name}</button>`).join('')}</div></div>
        <div class="field"><label>Печать</label>${colorSeg('pCol', '', it.color)}</div></div>
      <div class="row" style="margin-top:10px"><div class="field" style="width:140px"><label for="pQty">Тираж, шт</label><input id="pQty" inputmode="numeric" value="${it.qty}"></div>
        <div class="field" style="flex:1;min-width:180px"><label for="pPaper">Бумага</label><select id="pPaper">${Object.entries(S().paper).map(([k, p]) => `<option value="${k}" ${it.paper === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
      <div class="muted small" style="margin-top:8px">Кратность тиража для ${F.name} — ${F.step} шт (столько помещается на ${F.step / F.cap} листах А3). Макет и его сложность менеджер определяет сам — в этот расчёт не входят.</div></div>`;
}

function bookHtml(it) {
  const books = catalog.filter((c) => c.kind === 'Ж');
  const s = S(), metal = it.bind === 'metal', coil = ['plastic', 'metal'].includes(it.bind);
  const h = coil ? coilHint(bookParams(it), s) : null;
  return `<div class="card"><h2>Журнал из каталога</h2>
      <select id="pBook" style="width:100%" class="inp">${books.map((c) => `<option value="${c.id}" ${it.blankId === c.id ? 'selected' : ''}>${esc(c.code)} · ${esc(c.name)}${c.for_client ? ' (под ' + esc(c.client_name || 'заказчика') + ')' : ''}</option>`).join('')}<option value="" ${it.blankId ? '' : 'selected'}>Нестандартный — собрать вручную</option></select>
      ${it.blankId ? '' : `<div class="field" style="margin-top:10px"><label for="pBtitle">Название журнала</label><input id="pBtitle" value="${esc(it.title)}" placeholder="например, Журнал учёта дезинфекции"></div>`}
      <div class="muted small" style="margin-top:6px">Секции наполнения расписываются из карточки журнала. Их можно поправить или добавить свои.</div></div>
    <div class="card"><h2>Сколько книг</h2>
      <div class="row"><div class="field"><label>Формат</label><div class="seg"><button class="on">А4</button><button disabled title="Позже">А5 — позже</button></div></div>
        <div class="field" style="width:120px"><label for="pBooks">Книг, шт</label><input id="pBooks" inputmode="numeric" value="${it.books}"></div></div>
      <div class="muted small" style="margin-top:8px">Наполнение печатается на А3 и режется пополам: один лист А3 = два листа А4.</div></div>
    <div class="card"><h2>Обложки и переплёт</h2>
      <div class="muted small" style="margin-bottom:8px">У журнала обложки есть всегда: лицевая картон-кожа и задняя чёрная (при термоклее — термообложка). Без обложек это уже бланки.</div>
      ${tog('pFront', it.frontNoPrint, 'Лицевая без печати на принтере')}
      <div class="field" style="margin-top:12px"><label for="pBind">Переплёт</label><select id="pBind">${Object.entries(BIND).map(([k, t]) => `<option value="${k}" ${it.bind === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      ${metal ? `<div class="field" style="margin-top:8px"><label>Отверстия</label><div class="seg" id="pHoles">${Object.entries(HOLES).map(([k, t]) => `<button data-h="${k}" class="${it.holes === k ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>` : ''}
      ${coil ? `<div class="row" style="margin-top:8px"><div class="field" style="width:170px"><label for="pCoil">Диаметр пружины, мм</label><select id="pCoil">${h.list.map((x) => `<option value="${x}" ${(it.coil || h.d) === x ? 'selected' : ''}>${num(x, 1)}</option>`).join('')}</select></div>
        <div class="muted small" style="flex:1;min-width:200px">Толщина блока примерно ${num(h.thick, 1)} мм — подойдёт пружина от ⌀ ${num(h.d, 1)} мм.${h.fits ? '' : ' <b style="color:var(--bad)">Самая большая пружина может не взять такой блок.</b>'} Перфорация — до ${num(s.v('punchMax'), 0)} листов за проход.</div></div>` : ''}
      ${it.bind === 'thermo' ? '<div class="muted small" style="margin-top:6px">Термообложка заменяет картон-кожу; блок подрезается с трёх сторон после склейки.</div>' : ''}</div>
    <div class="card"><h2>Наполнение по секциям</h2>
      <div id="pSecs" style="display:flex;flex-direction:column;gap:10px">${it.sections.map((x, i) => `
        <div class="sec" data-i="${i}" style="border:1px solid var(--line);border-radius:14px;padding:10px">
          <div class="row" style="gap:8px"><input class="s-name inp" value="${esc(x.name)}" aria-label="Название секции" style="font-weight:700;flex:1">
            <button class="btn sm bad s-del" ${it.sections.length === 1 ? 'disabled' : ''} title="Убрать секцию">✕</button></div>
          <div class="row" style="margin-top:8px">
            <div class="field" style="width:130px"><label>Листов А4 на книгу</label><input class="s-sheets" inputmode="numeric" value="${x.sheets}"></div>
            <div class="field"><label>Печать</label>${colorSeg('', 's-color', x.color)}</div>
            <div class="field" style="flex:1;min-width:160px"><label>Бумага</label><select class="s-paper">${['off65', 'news49'].map((k) => `<option value="${k}" ${x.paper === k ? 'selected' : ''}>${esc(s.paper[k].name)}</option>`).join('')}</select></div>
          </div></div>`).join('')}</div>
      <button class="btn" id="pSecAdd" style="margin-top:10px">+ Секция</button>
      <div class="muted small" style="margin-top:8px">Нестандартный журнал собирается из нескольких секций: титул, наполнение, приложение.</div></div>
    <div class="card"><h2>Разворот</h2>${tog('pSpread', it.spread, 'Таблица идёт через разворот')}
      <div class="muted small" style="margin-top:6px">Тогда первая страница после обложки остаётся пустой: на каждую книгу добавляется один односторонний лист. Он печатается с мастера лицевой стороны, нового мастера не нужно.</div></div>`;
}

// ---------------------------------------------------------------- правая колонка
function drawRight(el) {
  const box = $('#pRight');
  let R;
  try { R = compute(); } catch (e) { box.innerHTML = `<div class="card"><div class="alert bad">${esc(errText(e))}</div></div>`; return; }
  const { s, res, o } = R;
  const it = cur(), r = res[st.cur], isBlank = it.kind === 'blank';
  const seeCost = app.me.perm('see_cost'), isDir = app.me.role === 'director';
  // проверки текущей позиции
  const C = [];
  if (isBlank) {
    const F = FORMATS[it.fmt], c = catRow(it.blankId);
    if (it.qty < F.step) C.push(['', `Маленький тираж: для ${F.name} от ${F.step} шт. Цена за штуку получится высокой.`]);
    else if (it.qty % F.step) C.push(['', `Тираж не кратен ${F.step} шт: на листах А3 останутся пустые места. Ближайшие кратные — в таблице ниже.`]);
    if (c && (c.fmt !== it.fmt || c.color !== it.color)) C.push(['', `В карточке бланка ${c.code}: ${FORMATS[c.fmt]?.name || c.fmt}, ${c.color}. Параметры изменены вручную.`]);
    if (!c) C.push(['', 'Бланка нет в каталоге — печатник увидит название, которое вы написали.']);
  }
  const forClient = st.items.map((x) => catRow(x.blankId)).filter((c) => c?.for_client);
  if (forClient.length) C.push(['', `${forClient.map((c) => c.code).join(', ')} — заполнен под заказчика «${forClient.map((c) => c.client_name).join('», «')}». При оформлении ERP проверит, что заказчик тот же.`]);
  if (o.approvals.includes('discount_over_limit') && !isDir) C.push(['', `Скидка ${num(o.discountPct)}% выше лимита ${num(s.discountMaxPct)}%: заказ создастся, но дальше пойдёт после подтверждения директора.`]);
  if (st.urgency !== 'standard' && st.discountPct > 0) C.push(['ok', 'Срочный заказ: скидка не действует.']);
  if (o.margin < 0) C.push(['bad', `Заказ в минус${isDir ? '' : ' — нужно подтверждение директора'}.`]);

  const kpis = isBlank
    ? [['Листов А3', `${num(r.a3, 0)} + ${r.pr}`], ['Мастеров', r.mReal < r.mClient ? `${r.mReal} <span class="muted small">(в цене ${r.mClient})</span>` : r.mClient], ['Оттисков', num(r.impressions, 0)], ['Резов', num(r.cuts, 0)]]
    : [['Листов А3', num(r.a3total, 0)], ['Мастеров', r.mReal < r.mClient ? `${r.mReal} <span class="muted small">(в цене ${r.mClient})</span>` : r.mClient], ['Оттисков', num(r.impressions, 0)], ['Резов', num(r.cutOps, 0)]];
  const work = isBlank
    ? `<table class="t"><tbody><tr><td>Формат и печать</td><td>${FORMATS[it.fmt].name}, ${it.color}, ${FORMATS[it.fmt].cap} шт на листе А3</td></tr>
        <tr><td>Бумага</td><td>${esc(s.paper[it.paper].name)}: ${num(r.sheets, 0)} листов А3 (из них ${r.pr} на приладку)</td></tr>
        ${r.cuts ? `<tr><td>Резка</td><td>${r.packs} ${plural(r.packs, 'пачка', 'пачки', 'пачек')} × ${FORMATS[it.fmt].cuts} рез.</td></tr>` : ''}</tbody></table>`
    : `<table class="t"><thead><tr><th>Секция</th><th class="r">Листов А4</th><th class="r">А3 + приладка</th><th class="r">Мастеров</th></tr></thead><tbody>${r.bySec.map((x) => `<tr>
        <td>${esc(x.names)}<div class="muted small">${x.color} · ${esc(x.paperName)}</div></td><td class="r">${num(x.a4, 0)}</td>
        <td class="r">${num(x.a3, 0)} + ${x.pr}${x.extra ? `<div class="muted small">+ ${x.extra} на разворот</div>` : ''}</td><td class="r">${x.mReal < x.masters ? `${x.mReal}<div class="muted small">в цене ${x.masters}</div>` : x.masters}</td></tr>`).join('')}</tbody></table>`;
  // сравнение тиража
  let cmp;
  if (isBlank) {
    const F = FORMATS[it.fmt], baseQ = Math.max(F.step, Math.round(it.qty / F.step) * F.step);
    const qs = [...new Set([baseQ - F.step, baseQ, baseQ + F.step, baseQ + 5 * F.step].filter((q) => q >= F.step))];
    cmp = `<h2>Ближайшие кратные тиражи</h2><table class="t"><thead><tr><th>Тираж</th><th class="r">За тираж</th><th class="r">За штуку</th></tr></thead><tbody>${qs.map((q) => { const c = calcBlank(q, it, s); return `<tr class="pick ${q === it.qty ? 'sel' : ''}" data-q="${q}"><td>${num(q, 0)} шт</td><td class="r">${rub(c.total)}</td><td class="r">${rubK(c.per)}</td></tr>`; }).join('')}</tbody></table>
      <div class="muted small" style="margin-top:6px">Нажмите на строку, чтобы взять этот тираж. Кратный тираж заполняет листы А3 целиком.</div>`;
  } else {
    cmp = `<h2>Сравнение тиража</h2><table class="t"><thead><tr><th>Книг</th><th class="r">Всего</th><th class="r">За книгу</th>${seeCost ? '<th class="r">Маржа</th>' : ''}</tr></thead><tbody>${[1, 2, 5, 10].map((q) => { const c = calcBook(q, bookParams(it), s); return `<tr class="${q === it.books ? 'sel' : ''}"><td>${q}</td><td class="r">${rub(c.total)}</td><td class="r">${rub(c.per)}</td>${seeCost ? `<td class="r">${rub(c.T.margin + (c.total - c.T.price))}</td>` : ''}</tr>`; }).join('')}</tbody></table>
      <div class="muted small" style="margin-top:6px">С ростом тиража запуск ризографа и мастер-плёнка делятся на большее число книг, поэтому одна книга дешевеет.</div>`;
  }
  // из чего цена — тем, кто видит себестоимость
  const round = r.total - r.T.price;
  const lines = seeCost ? `<div class="card"><h2>Из чего цена · позиция ${st.cur + 1}</h2><div class="tbl" style="overflow-x:auto"><table class="t"><thead><tr><th>Строка</th><th class="r">Сколько</th><th class="r">Цена</th><th class="r">Доля</th><th class="r">Себест.</th><th class="r">ФОТ</th><th class="r">Премия</th><th class="r">Маржа</th></tr></thead><tbody>
      ${r.L.map((l) => { const sh = r.T.price ? l.price / r.T.price * 100 : 0; return `<tr><td>${esc(l.name)}${l.temp ? ' <span class="chip warn nodot">временная</span>' : ''}</td><td class="r muted small">${esc(l.qty)}</td><td class="r">${rubK(l.price)}</td><td class="r">${num(sh, 1)}%</td><td class="r">${rubK(l.cost)}</td><td class="r">${rubK(l.fot)}</td><td class="r">${rubK(l.prem)}</td><td class="r" style="color:${l.margin < 0 ? 'var(--bad)' : 'inherit'}">${rubK(l.margin)}</td></tr>`; }).join('')}
      ${round > 0.004 ? `<tr><td>Округление цены за ${isBlank ? 'штуку' : 'книгу'} вверх</td><td></td><td class="r">${rubK(round)}</td><td></td><td></td><td></td><td></td><td class="r">${rubK(round)}</td></tr>` : ''}
      <tr><td><b>Итого</b></td><td></td><td class="r"><b>${rubK(r.total)}</b></td><td class="r">100%</td><td class="r">${rubK(r.T.cost)}</td><td class="r">${rubK(r.T.fot)}</td><td class="r">${rubK(r.T.prem)}</td><td class="r"><b>${rubK(r.T.margin + round)}</b></td></tr></tbody></table></div>
      <div class="muted small" style="margin-top:6px">Мастер-плёнка: клиенту двусторонняя печать — два мастера, по факту ${r.mReal < r.mClient ? 'печатаем на одном мастере переворотом листа' : 'столько же мастеров'}; в себестоимости — фактические мастера. Маржа = цена − себестоимость − ФОТ − премия. Цены и нормы — «Настройки → Полиграфия».</div></div>` : '';

  box.innerHTML = `
    <div class="card"><h2>Стоимость заказа</h2>
      ${res.map((x, i) => `<div class="total-line ${i === st.cur ? '' : 'muted'}"><span>${i + 1}. ${esc(titleOf(st.items[i]))}<div class="small muted">${st.items[i].kind === 'blank' ? `${num(x.qty, 0)} шт × ${rubK(x.per)}` : `${x.qty} ${plural(x.qty, 'книга', 'книги', 'книг')} × ${rub(x.per)}`}</div></span><span>${rubK(x.total)}</span></div>`).join('')}
      ${o.sumDiscount ? `<div class="total-line"><span>Скидка ${num(o.discountPct)}%</span><span>−${rubK(o.sumDiscount)}</span></div>` : ''}
      ${o.sumUrgency ? `<div class="total-line"><span>Срочность · ${URGENCY[st.urgency]}</span><span>+${rub(o.sumUrgency)}</span></div>` : ''}
      <div class="total-line big"><span>Итого</span><span id="pTotal">${rub(o.final)}</span></div>
      ${seeCost ? `<div class="total-line small muted"><span>Себестоимость · ФОТ и премия</span><span>${rub(o.cost)} · ${rub(o.fot + o.prem)}</span></div><div class="total-line small"><span>Маржа</span><b style="color:${o.margin < 0 ? 'var(--bad)' : 'var(--ok)'}">${rub(o.margin)}</b></div>` : ''}
      ${C.map(([k, t]) => `<div class="alert ${k}">${esc(t)}</div>`).join('')}
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="pReset">Сбросить</button><button class="btn primary" id="pPlace">Оформить заказ</button></div></div>
    <div class="card"><h2>Что уйдёт в работу · позиция ${st.cur + 1}</h2>
      <div class="row" style="gap:18px;margin-bottom:8px">${kpis.map(([t, x]) => `<div><div class="muted small">${t}</div><b style="font-size:18px">${x}</b></div>`).join('')}</div>${work}</div>
    <div class="card">${cmp}</div>
    ${lines}`;
  $$('#pRight tr.pick').forEach((tr) => tr.addEventListener('click', () => { it.qty = Number(tr.dataset.q); drawLeft(el); drawRight(el); }));
  $('#pReset').addEventListener('click', () => { st = fresh(); renderPoly(el); });
  $('#pPlace').addEventListener('click', () => placeDialog(R));
}

// ---------------------------------------------------------------- оформление
function rows(R) {
  const { s, res, o } = R;
  const order = {
    manager_id: app.me.id, urgency: st.urgency, discount_pct: o.discountPct,
    sum_print: o.total, sum_post: 0, sum_waste: 0, sum_discount: o.sumDiscount, sum_urgency: o.sumUrgency,
    total: o.final, cost_total: o.cost, margin: o.margin, draft_key: 'poly', last_activity_at: new Date().toISOString(),
  };
  const items = st.items.map((it, i) => {
    const r = res[i], title = titleOf(it);
    const fmt = it.kind === 'blank' ? it.fmt : 'A4';
    return {
      kind: it.kind, blank_id: it.blankId, title, fmt, color: it.kind === 'blank' ? it.color : null, paper: it.kind === 'blank' ? it.paper : null,
      qty: r.qty, params: it.kind === 'book' ? { sections: it.sections, bind: it.bind, holes: it.holes, coil: r.coil, spread: it.spread, frontNoPrint: it.frontNoPrint } : {},
      lines: r.L.map((l) => ({ name: l.name, kind: l.kind, qty: l.qty, price: Math.round(l.price * 100) / 100, cost: Math.round(l.cost * 100) / 100, fot: Math.round(l.fot * 100) / 100, prem: Math.round(l.prem * 100) / 100, temp: !!l.temp })),
      price_per: r.per, total: r.total, cost: Math.round(r.T.cost * 100) / 100,
      jobs: risoJobs(r, title, fmt, it.kind === 'blank' ? s.paper[it.paper].name : null),
    };
  });
  return { order, items };
}

function placeDialog(R) {
  let client = null;
  const total = R.o.final;
  const m = modal(`<h3>Оформить заказ · ${rub(total)}</h3>
    <div class="field"><label>Клиент — поиск по имени или телефону</label><input id="cq" placeholder="Иванов или +7913…" autocomplete="off"></div>
    <div id="cres" style="margin-top:6px"></div>
    <div id="cnew" class="hidden" style="margin-top:10px">
      <div class="row"><div class="field" style="flex:1"><label>Имя / организация</label><input id="cn"></div><div class="field" style="flex:1"><label>Телефон</label><input id="cp" inputmode="tel"></div></div>
      <button class="btn sm" id="csave" style="margin-top:8px">Создать клиента</button></div>
    <div id="csel" class="alert ok hidden"></div>
    <div class="field" style="margin-top:12px"><label>Срок готовности</label><input id="due" type="datetime-local"></div>
    <div id="pay" class="hidden" style="margin-top:12px">
      <div class="field"><label>Способ оплаты</label><div class="seg" id="pm">${app.refs.methods.map((p, i) => `<button data-m="${p.code}" class="${i === 0 ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:8px;width:180px"><label>Сумма, ₽</label><input id="pa" inputmode="decimal" value="${total}"></div></div>
    <div class="acts"><button class="btn" id="noPay" disabled>Оформить без оплаты</button>
      ${app.me.perm('take_payment') ? '<button class="btn primary" id="withPay" disabled>Принять оплату</button>' : ''}</div>`);
  const E = (id) => m.el.querySelector('#' + id);
  const pick = (c) => {
    client = c;
    // бланк «под клиента» печатается только для этого заказчика
    const alien = st.items.map((x) => catRow(x.blankId)).filter((b) => b?.for_client && b.client_id !== c.id);
    E('csel').className = 'alert ' + (alien.length ? 'bad' : 'ok');
    E('csel').textContent = alien.length ? `${alien.map((b) => b.code).join(', ')} заполнен под заказчика «${alien.map((b) => b.client_name).join('», «')}». Для «${c.name}» его печатать нельзя.` : 'Клиент: ' + c.name + (c.phone ? ' · ' + c.phone : '');
    E('cres').innerHTML = ''; E('cnew').classList.add('hidden');
    const okc = !alien.length;
    E('noPay').disabled = !okc; if (E('withPay')) E('withPay').disabled = !okc;
    E('pay').classList.toggle('hidden', !okc);
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
    try { pick(await app.api.createClient({ name, phone: E('cp').value.trim() || null, owner_id: app.me.id })); } catch (e) { toast(errText(e), 'bad'); }
  });
  m.el.querySelectorAll('#pm button').forEach((b) => b.addEventListener('click', () => m.el.querySelectorAll('#pm button').forEach((x) => x.classList.toggle('on', x === b))));
  const go = async (withPay) => {
    E('noPay').disabled = true; if (E('withPay')) E('withPay').disabled = true;
    try {
      const { order, items } = rows(R);
      const id = await app.api.savePoly(null, order, items);
      const due = E('due').value ? new Date(E('due').value).toISOString() : null;
      const o = await app.api.placeOrder(id, { client_id: client.id, due_at: due });
      if (withPay) {
        const amount = Number(parseIn(E('pa').value));
        if (amount > 0) await app.api.addPayment(id, m.el.querySelector('#pm button.on').dataset.m, amount, app.me.id);
      }
      m.close();
      toast(`Заказ ${o.number} оформлен`);
      st = fresh();
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
