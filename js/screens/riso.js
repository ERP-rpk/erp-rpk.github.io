// Экран «Ризограф»: отчёт печатника по тиражу, тубы краски по номерам баллонов, мастер-плёнка, журнал.
// Сделан по одобренному прототипу prototype/riso-report.html. Все проверки дублируются в базе (миграция 019).
import { app, setTitle } from '../app.js?v=f8825c7';
import { $, $$, esc, num, dt, toast, errText, numInputs, parseIn } from '../ui.js?v=f8825c7';

const CAP = { A3: 1, A4: 2, A5: 4, A6: 8, A7: 16, DL: 6 };
const FMT = { A3: 'А3', A4: 'А4', A5: 'А5', A6: 'А6', A7: 'А7', DL: 'DL' };
const PAPERS = ['Газетная 48,8 г', 'Офсетная 65 г', 'Ватман 180 г'];
const WORDS = ['Почти пусто', 'Осталось мало', 'Осталось примерно половина', 'Почти полная', 'Полная'];
const level = (left) => Math.max(0, Math.min(4, Math.round(left * 4)));
// батарейка из 4 делений (горизонтальная) — только при выборе остатка и на карточках баллонов
const gauge = (lv, cls = '') => `<span class="gauge ${cls}">${[1, 2, 3, 4].map((k) => `<i data-lv="${k}" class="${k <= lv ? 'on' : ''}"></i>`).join('')}</span>`;
const bar = (frac) => `<div class="rbar"><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></i></div>`;

let S = null;          // состояние из базы
let f = null;          // форма отчёта
let catalog = [];      // каталог бланков (действующие)
let queue = [];        // задания из заказов полиграфии (без цен и клиентов)
const isDir = () => app.me.role === 'director';
const pctTxt = (frac) => (isDir() ? ` <span class="muted small">${Math.round(frac * 100)}%</span>` : '');
const newForm = () => ({ job: null, blank: null, q: '', title: '', fmt: 'A4', color: '1+0', qty: '', paper: PAPERS[0], layouts: 1, end: '', masters: null, roll: 0, brak: [], noBrak: false, mbrak: [], note: '', mnote: '' });

export async function renderRiso(el) {
  setTitle('Ризограф');
  [S, catalog, queue] = await Promise.all([app.api.risoStatus(), app.api.blankCatalog().catch(() => []), app.api.risoQueue().catch(() => [])]);
  if (!f) f = newForm();
  el.innerHTML = `<div class="riso">
    <div class="grid2" style="gap:12px"><div class="card" id="rTube"></div><div class="card" id="rFilm"></div></div>
    <div id="rBox"></div>
    <div class="card" id="rQueue"></div>
    <div class="card" id="rForm"></div>
    <div class="card"><h2>Журнал</h2><div class="tbl" id="rLog"><div class="muted">Загрузка…</div></div></div></div>`;
  drawTop(el);
  drawQueue(el);
  drawForm(el);
  drawLog();
}

const reload = async (el) => { [S, queue] = await Promise.all([app.api.risoStatus(), app.api.risoQueue().catch(() => [])]); drawTop(el); drawQueue(el); drawForm(el); drawLog(); };

// ---------- очередь: тиражи из заказов (после согласования макета) ----------
function drawQueue(el) {
  $('#rQueue').innerHTML = `<h2>Очередь</h2>${queue.length ? `<div style="display:flex;flex-direction:column;gap:6px">${queue.map((j, i) => `<div class="job ${f.job && f.job.item_id === j.item_id && f.job.job === j.job ? 'on' : ''}" data-q="${i}"><span><b>${esc(j.title)}</b><div class="muted small">${esc(j.number || '')}${j.urgency && j.urgency !== 'standard' ? ' · <b style="color:var(--bad)">срочно</b>' : ''}${j.due_at ? ' · к ' + dt(j.due_at) : ''}</div></span><span class="muted small" style="text-align:right">${FMT[j.fmt]} · ${j.color} · ${num(j.qty, 0)} шт<div>${esc(j.paper || '')}</div></span></div>`).join('')}</div><div class="muted small" style="margin-top:6px">Нажмите на тираж — его параметры подставятся в отчёт. Тираж без заказа можно отметить ниже, как раньше.</div>` : '<div class="muted small">Заказов на ризограф нет. Тираж без заказа можно отметить ниже.</div>'}`;
  $$('#rQueue [data-q]').forEach((d) => { d.onclick = () => {
    const j = queue[d.dataset.q];
    f = { ...newForm(), job: j, blank: catalog.find((c) => c.id === j.blank_id) || null, title: j.title, fmt: j.fmt, color: j.color, qty: j.qty, paper: j.paper || PAPERS[0], layouts: j.layouts };
    drawQueue(el); drawForm(el);
  }; });
}

// ---------- туба и мастер-плёнка ----------
function drawTop(el) {
  const cur = S.tubes.find((t) => t.state === 'in');
  const stock = S.tubes.filter((t) => t.state === 'stock' || t.state === 'rest');
  const left = cur ? Math.max(0, 1 - cur.used / S.tube_res) : 0;
  const W = [];
  if (cur && cur.used > S.tube_res * 1.5) W.push(`Туба ${cur.no} печатает уже ${num(cur.used, 0)} оттисков — в 1,5 раза больше обычного. Не забыли отметить замену?`);
  const fresh = stock.filter((t) => t.state === 'stock').length;
  if (fresh <= 2) W.push(`Новых туб на складе ${fresh} — пора заказывать краску.`);
  $('#rTube').innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Туба</h2>
      <div class="row" style="gap:6px">${isDir() ? '<button class="btn sm" id="rRecv">Приход туб</button>' : ''}<button class="btn sm" id="rChg" ${stock.length ? '' : 'disabled'}>Заменить</button></div></div>
    <div style="margin-top:8px"><b>В аппарате <span class="mono">${cur ? cur.no : '—'}</span></b> · ${cur ? WORDS[level(left)] + pctTxt(left) : 'тубы нет'}</div>${bar(left)}
    <div class="muted small" style="margin-top:8px">На складе ${stock.length}: ${stock.map((t) => `<span class="mono">${t.no}</span>${t.state === 'rest' ? ` (${WORDS[level(t.left)].toLowerCase()})` : ''}`).join(', ') || '—'}</div>
    ${W.map((t) => `<div class="alert" style="margin-top:8px">${esc(t)}</div>`).join('')}`;
  const fl = Math.max(0, S.film_res - (S.master_counter - S.film_from));
  $('#rFilm').innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Мастер-плёнка</h2><button class="btn sm" id="rFchg">Заменить</button></div>
    <div style="margin-top:8px"><b>Осталось примерно ${num(fl, 0)} из ${num(S.film_res, 0)}</b> <span class="muted small">мастеров · счётчик мастеров ${num(S.master_counter, 0)}</span></div>${bar(fl / S.film_res)}
    ${fl <= 20 ? '<div class="alert" style="margin-top:8px">Плёнка заканчивается — приготовьте новый рулон.</div>' : ''}
    ${isDir() ? '<div class="row" style="margin-top:10px"><button class="btn sm" id="rAlign">Выровнять счётчики</button></div>' : ''}`;
  $('#rChg').onclick = () => changeTube(el);
  $('#rFchg').onclick = () => changeFilm(el);
  $('#rRecv')?.addEventListener('click', () => receiveTubes(el));
  $('#rAlign')?.addEventListener('click', () => align(el));
}
const box = (html) => { $('#rBox').innerHTML = `<div class="card">${html}</div>`; };
const closeBox = () => { $('#rBox').innerHTML = ''; };

function changeTube(el) {
  const cur = S.tubes.find((t) => t.state === 'in');
  const cand = S.tubes.filter((t) => t.state === 'rest' || t.state === 'stock');
  let pick = cand[0]?.id, lv = 2, ended = 'empty', at = String(S.copy_counter);
  const draw = () => {
    box(`<h2>Замена тубы</h2>
      ${cur ? `<b>Что с ${cur.no}?</b><div class="row" style="margin-top:6px"><button class="btn ${ended === 'empty' ? 'primary' : ''}" id="eE">Закончилась полностью</button><button class="btn ${ended === 'rest' ? 'primary' : ''}" id="eR">Аппарат считает пустой, а краска осталась</button></div>
        ${ended === 'rest' ? `<div class="row" style="margin-top:10px;gap:14px;align-items:center">${gauge(lv, 'pick')}<div><b style="font-size:17px">${WORDS[lv]}</b>${isDir() ? `<div class="muted small">${lv * 25}%</div>` : ''}<div class="muted small">Нажмите на деление, до которого осталась краска</div></div></div>` : ''}` : ''}
      <div style="margin-top:12px"><b>Какой баллон ставите</b><div class="pick-row" style="margin-top:6px">${cand.map((t, i) => `<div class="tcard ${t.id === pick ? 'on' : ''}" data-id="${t.id}">${gauge(t.state === 'rest' ? level(t.left) : 4, 'sm')}<div><b class="mono">${t.no}</b><div class="muted small">${t.state === 'rest' ? WORDS[level(t.left)].toLowerCase() : 'новая'}${i === 0 ? ' · самая старая' : ''}</div></div></div>`).join('')}</div></div>
      <div class="row" style="margin-top:12px;align-items:center"><label for="rAt" class="small">На каком счётчике копий поставили</label><input id="rAt" inputmode="numeric" value="${esc(at)}" style="width:140px"></div>
      <div class="muted small">Оттиски до этого числа относятся к старой тубе, после — к новой. Не важно, до тиража или в середине.</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="rOk" ${pick ? '' : 'disabled'}>Поставил</button><button class="btn" id="rCancel">Отмена</button></div>`);
    $('#eE') && ($('#eE').onclick = () => { ended = 'empty'; draw(); });
    $('#eR') && ($('#eR').onclick = () => { ended = 'rest'; draw(); });
    $$('#rBox .gauge.pick i').forEach((i) => { i.onclick = () => { lv = Number(i.dataset.lv); draw(); }; });
    $$('#rBox .tcard').forEach((c) => { c.onclick = () => { pick = c.dataset.id; draw(); }; });
    $('#rAt').oninput = (e) => { at = e.target.value; };
    $('#rCancel').onclick = closeBox;
    $('#rOk').onclick = async () => {
      try { await app.api.risoChangeTube(ended, ended === 'rest' ? lv / 4 : null, pick, Math.round(Number(parseIn(at)))); closeBox(); toast('Туба заменена'); reload(el); }
      catch (e) { toast(errText(e), 'bad'); }
    };
  };
  draw();
}

function changeFilm(el) {
  box(`<h2>Замена мастер-плёнки</h2>
    <div class="row" style="align-items:center"><label for="rFc" class="small">На каком счётчике мастеров поставили новую плёнку?</label><input id="rFc" inputmode="numeric" value="${S.master_counter}" style="width:120px"></div>
    <div class="muted small">Мастера до этого числа относятся к старой плёнке, после — к новой. Рулоны не нумеруем.</div>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="rOk">Поставил</button><button class="btn" id="rCancel">Отмена</button></div>`);
  $('#rCancel').onclick = closeBox;
  $('#rOk').onclick = async () => {
    try { await app.api.risoChangeFilm(Math.round(Number(parseIn($('#rFc').value)))); closeBox(); toast('Плёнка заменена'); reload(el); } catch (e) { toast(errText(e), 'bad'); }
  };
}

function receiveTubes(el) {
  box(`<h2>Приход туб</h2>
    <div class="row" style="align-items:center"><label for="rN" class="small">Сколько баллонов пришло</label><input id="rN" inputmode="numeric" value="1" style="width:80px"></div>
    <div class="muted small">ERP выдаст номера по порядку — подпишите их на баллонах маркером.</div>
    ${S.tubes.some((t) => t.state === 'in') ? '' : '<label class="toggle" style="margin-top:8px"><input type="checkbox" id="rPut" checked> Первый баллон сразу в аппарат</label>'}
    <div class="row" style="margin-top:10px"><button class="btn primary" id="rOk">Провести</button><button class="btn" id="rCancel">Отмена</button></div>`);
  $('#rCancel').onclick = closeBox;
  $('#rOk').onclick = async () => {
    try {
      const nos = await app.api.risoReceiveTubes(Math.round(Number(parseIn($('#rN').value))), !!$('#rPut')?.checked);
      box(`<h2>Подпишите баллоны</h2><div class="row" style="gap:8px">${nos.map((n) => `<span class="chip nodot mono" style="font-size:15px">${esc(n)}</span>`).join('')}</div><div class="row" style="margin-top:10px"><button class="btn" id="rCancel">Готово</button></div>`);
      $('#rCancel').onclick = closeBox; S = await app.api.risoStatus(); drawTop(el);
    } catch (e) { toast(errText(e), 'bad'); }
  };
}

function align(el) {
  box(`<h2>Выровнять счётчики</h2>
    <div class="muted small" style="margin-bottom:8px">Только директор. Например, при начале учёта в ERP или после пропущенных записей. Причина обязательна, запись попадёт в журнал.</div>
    <div class="row"><div class="field"><label for="rAc">Счётчик копий</label><input id="rAc" inputmode="numeric" value="${S.copy_counter || ''}" style="width:150px"></div>
      <div class="field"><label for="rAm">Счётчик мастеров</label><input id="rAm" inputmode="numeric" value="${S.master_counter || ''}" style="width:130px"></div>
      <div class="field" style="flex:1;min-width:200px"><label for="rAr">Причина</label><input id="rAr" placeholder="например, начало учёта в ERP"></div></div>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="rOk">Записать</button><button class="btn" id="rCancel">Отмена</button></div>`);
  $('#rCancel').onclick = closeBox;
  $('#rOk').onclick = async () => {
    try { await app.api.risoAlign(Math.round(Number(parseIn($('#rAc').value))) || null, Math.round(Number(parseIn($('#rAm').value))) || null, $('#rAr').value.trim()); closeBox(); toast('Счётчики выровнены'); reload(el); }
    catch (e) { toast(errText(e), 'bad'); }
  };
}

// ---------- отчёт по тиражу ----------
const planOf = () => Math.ceil((Number(f.qty) || 0) / CAP[f.fmt]) * (f.color === '1+1' ? 2 : 1) + (f.job?.plus || 0);
const mastersPlan = () => (f.layouts || 1) * Math.max(1, Math.ceil(Math.ceil((Number(f.qty) || 0) / CAP[f.fmt]) / 3000));
function guess(end, start, plan) {
  const c = new Set();
  for (let i = 0; i <= end.length; i++) for (let d = 0; d <= 9; d++) c.add(end.slice(0, i) + d + end.slice(i));
  for (let i = 0; i < end.length; i++) c.add(end.slice(0, i) + end.slice(i + 1));
  let best = null;
  for (const s of c) { const v = Number(s), diff = v - start; if (diff >= plan && diff <= plan + S.over && (!best || Math.abs(diff - plan) < Math.abs(best - start - plan))) best = v; }
  return best;
}

function drawForm(el) {
  if (!S.copy_counter) {
    $('#rForm').innerHTML = `<h2>Отчёт по тиражу</h2><div class="alert">${isDir() ? 'Внесите текущие показания счётчиков кнопкой «Выровнять счётчики» и проведите приход туб — после этого печатник сможет отмечать тиражи.' : 'Директор ещё не внёс начальные показания счётчиков. После этого здесь можно будет отмечать тиражи.'}</div>`;
    return;
  }
  const q = f.q.trim().toLowerCase();
  const found = catalog.filter((c) => !q || (c.code + ' ' + c.name + ' ' + (c.old_number || '') + ' ' + (c.client_name || '')).toLowerCase().includes(q)).slice(0, 8);
  if (f.masters == null) f.masters = mastersPlan();
  const plan = planOf(), mplan = mastersPlan(), start = S.copy_counter;
  const formRest = () => `    <div class="grid2" style="margin-top:12px">
      <div><div class="muted small">Счётчик в начале (подставлен)</div><b style="font-size:18px">${num(start, 0)}</b>${plan ? `<div class="muted small">план ${num(plan, 0)} оттисков</div>` : ''}</div>
      <div class="field"><label for="rEnd">Счётчик в конце</label><input id="rEnd" inputmode="numeric" value="${esc(f.end)}"></div>
    </div>
    <div id="rCnt" style="margin-top:8px"></div>
    <div class="row" style="margin-top:10px;align-items:center"><span>Мастеров на тираж:</span><button class="btn sm" id="rMm">−</button><b id="rMv">${f.masters}</b><button class="btn sm" id="rMp">+</button><span class="muted small">по плану ${mplan}</span></div>
    <div id="rMchk" style="margin-top:6px"></div>
    <h2 style="margin-top:14px">Раскатка и брак</h2>
    <div class="row" style="align-items:center"><span style="min-width:170px">Раскатка мастера, листов</span><button class="btn sm" data-k="roll" data-d="-1">−</button><input data-k="roll" value="${f.roll}" inputmode="numeric" style="width:64px;text-align:center"><button class="btn sm" data-k="roll" data-d="1">+</button><span class="muted small">технология, не брак</span></div>
    <div id="rBrak" style="display:flex;flex-direction:column;gap:6px;margin-top:8px"></div>
    <div class="row" style="margin-top:8px"><button class="btn" id="rAddB">+ ещё причина</button><button class="btn ${f.noBrak && !f.brak.length ? 'primary' : ''}" id="rNoB">Брака не было</button></div>
    <div id="rMbrak" style="display:flex;flex-direction:column;gap:6px;margin-top:10px"></div>
    <div class="row" style="margin-top:6px"><button class="btn" id="rAddM">+ испорченный мастер</button></div>
    <div id="rRec" style="margin-top:10px"></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" id="rSave">Тираж напечатан</button></div>`;
  $('#rForm').innerHTML = f.job ? `<h2>Отчёт по тиражу</h2>
    <div class="job on"><span><b>${esc(f.job.title)}</b><div class="muted small">из заказа ${esc(f.job.number || '')} · ${FMT[f.fmt]} · ${f.color} · ${num(f.qty, 0)} шт · ${esc(f.paper)}${f.job.plus ? ` · +${f.job.plus} односторонних листов на разворот` : ''}</div></span><button class="btn sm" id="rUnjob">Без заказа</button></div>` + formRest() : `<h2>Отчёт по тиражу</h2>
    <div class="field"><label for="rQ">Бланк из каталога</label><input id="rQ" placeholder="Поиск: номер, старый номер, название" value="${esc(f.q)}"></div>
    <div id="rCat" style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${f.blank ? `<div class="job on"><span><b class="mono">${esc(f.blank.code)}</b> · ${esc(f.blank.name)}</span><button class="btn sm" id="rUnpick">Другой</button></div>`
      : found.map((c) => `<div class="job" data-id="${c.id}"><span><b class="mono">${esc(c.code)}</b> · ${esc(c.name)}${c.old_number ? ` <span class="muted small">(${esc(c.old_number)})</span>` : ''}</span><span class="muted small">${FMT[c.fmt]} · ${c.color}</span></div>`).join('')
        || `<div class="muted small">${catalog.length ? 'Ничего не найдено.' : 'Каталог бланков пока пуст.'} Можно отметить тираж без каталога — напишите название ниже.</div>`}</div>
    ${f.blank ? '' : `<div class="field" style="margin-top:8px"><label for="rTitle">Нет в каталоге — название тиража</label><input id="rTitle" value="${esc(f.title)}" placeholder="например, Журнал учёта дезинфекции"></div>`}
    <div class="row" style="margin-top:10px">
      <div class="field"><label>Формат</label><div class="seg" id="rFmt">${Object.entries(FMT).map(([k, t]) => `<button data-f="${k}" class="${f.fmt === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="field"><label>Печать</label><div class="seg" id="rCol">${['1+0', '1+1'].map((c) => `<button data-c="${c}" class="${f.color === c ? 'on' : ''}">${c}</button>`).join('')}</div></div>
    </div>
    <div class="row" style="margin-top:10px">
      <div class="field" style="width:120px"><label for="rQty">Тираж, шт</label><input id="rQty" inputmode="numeric" value="${esc(f.qty)}"></div>
      <div class="field" style="flex:1;min-width:160px"><label for="rPaper">Бумага</label><select id="rPaper">${PAPERS.map((p) => `<option ${f.paper === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field" style="width:130px"><label for="rLay">Разных макетов</label><input id="rLay" inputmode="numeric" value="${f.layouts}"></div>
    </div>
` + formRest();
  numInputs($('#rForm'));
  const redraw = () => drawForm(el);
  $('#rUnjob')?.addEventListener('click', () => { f = newForm(); drawQueue(el); redraw(); });
  if ($('#rQ')) $('#rQ').oninput = (e) => { const pos = e.target.selectionStart; f.q = e.target.value; redraw(); const i = $('#rQ'); i.focus(); i.setSelectionRange(pos, pos); };
  $$('#rCat .job[data-id]').forEach((j) => { j.onclick = () => { const c = catalog.find((x) => x.id === j.dataset.id); f.blank = c; f.fmt = c.fmt; f.color = c.color; f.masters = null; redraw(); }; });
  $('#rUnpick')?.addEventListener('click', () => { f.blank = null; redraw(); });
  $('#rTitle')?.addEventListener('input', (e) => { f.title = e.target.value; });
  $$('#rFmt button').forEach((b) => { b.onclick = () => { f.fmt = b.dataset.f; f.masters = null; redraw(); }; });
  $$('#rCol button').forEach((b) => { b.onclick = () => { f.color = b.dataset.c; redraw(); }; });
  if ($('#rQty')) $('#rQty').onchange = (e) => { f.qty = parseIn(e.target.value); f.masters = null; redraw(); };
  if ($('#rPaper')) $('#rPaper').onchange = (e) => { f.paper = e.target.value; };
  if ($('#rLay')) $('#rLay').onchange = (e) => { f.layouts = Math.max(1, Math.round(Number(parseIn(e.target.value)) || 1)); f.masters = null; redraw(); };
  $('#rEnd').oninput = (e) => { f.end = e.target.value; check(); };
  $('#rMm').onclick = () => { f.masters = Math.max(1, f.masters - 1); $('#rMv').textContent = f.masters; check(); };
  $('#rMp').onclick = () => { f.masters += 1; $('#rMv').textContent = f.masters; check(); };
  $$('#rForm button[data-k]').forEach((b) => { b.onclick = () => { f.roll = Math.max(0, f.roll + Number(b.dataset.d)); redraw(); }; });
  $$('#rForm input[data-k]').forEach((i) => { i.oninput = () => { f.roll = Math.max(0, Math.round(Number(parseIn(i.value)) || 0)); check(); }; });
  $('#rAddB').onclick = () => { f.noBrak = false; f.brak.push({ reason: S.reasons[0], sheets: 1, comment: '' }); drawBrak(); check(); };
  $('#rNoB').onclick = () => { f.brak = []; f.noBrak = true; redraw(); };
  $('#rAddM').onclick = () => { f.mbrak.push(''); drawMbrak(); check(); };

  function drawBrak() {
    $('#rBrak').innerHTML = f.brak.map((b, i) => `<div class="row" style="align-items:center"><select data-bi="${i}" style="flex:1;min-width:160px">${S.reasons.map((r) => `<option ${b.reason === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <button class="btn sm" data-bi="${i}" data-d="-1">−</button><input data-bi="${i}" class="bq" value="${b.sheets}" inputmode="numeric" style="width:64px;text-align:center"><button class="btn sm" data-bi="${i}" data-d="1">+</button><span class="small">листов</span>
      ${b.reason === 'Другое' ? `<input data-bi="${i}" class="bc" placeholder="что именно" value="${esc(b.comment)}" style="flex:1;min-width:140px">` : ''}<button class="btn sm" data-del="${i}">✕</button></div>`).join('');
    $$('#rBrak select').forEach((s) => { s.onchange = () => { f.brak[s.dataset.bi].reason = s.value; drawBrak(); check(); }; });
    $$('#rBrak button[data-d]').forEach((b) => { b.onclick = () => { const x = f.brak[b.dataset.bi]; x.sheets = Math.max(0, x.sheets + Number(b.dataset.d)); drawBrak(); check(); }; });
    $$('#rBrak .bq').forEach((i) => { i.oninput = () => { f.brak[i.dataset.bi].sheets = Math.max(0, Math.round(Number(i.value) || 0)); check(); }; });
    $$('#rBrak .bc').forEach((i) => { i.oninput = () => { f.brak[i.dataset.bi].comment = i.value; }; });
    $$('#rBrak button[data-del]').forEach((b) => { b.onclick = () => { f.brak.splice(b.dataset.del, 1); drawBrak(); check(); }; });
  }
  function drawMbrak() {
    $('#rMbrak').innerHTML = f.mbrak.map((x, i) => `<div class="row" style="align-items:center"><span style="min-width:150px">Испорченный мастер ${i + 1}</span><input data-mi="${i}" placeholder="почему испортился (обязательно)" value="${esc(x)}" style="flex:1;min-width:180px"><button class="btn sm" data-mdel="${i}">✕</button></div>`).join('');
    $$('#rMbrak input').forEach((i) => { i.oninput = () => { f.mbrak[i.dataset.mi] = i.value; }; });
    $$('#rMbrak button').forEach((b) => { b.onclick = () => { f.mbrak.splice(b.dataset.mdel, 1); drawMbrak(); check(); }; });
  }
  function check() {
    const C = [], end = String(f.end).replace(/\s/g, '');
    let diff = null;
    if (end && plan) {
      const e = Number(end);
      diff = e - start;
      if (e < start) { const g = guess(end, start, plan); C.push(['bad', `Конец меньше начала (${num(start, 0)}).${g ? ` Может быть, ${num(g, 0)}?` : ''}`]); diff = null; }
      else if (diff > plan + S.over) { const g = diff > plan * 3 ? guess(end, start, plan) : null; C.push([g ? 'bad' : '', g ? `Напечатано ${num(diff, 0)} оттисков при плане ${num(plan, 0)} — похоже, лишняя или пропущенная цифра. Может быть, ${num(g, 0)}?` : `Напечатано ${num(diff, 0)} при плане ${num(plan, 0)}: на ${num(diff - plan, 0)} больше. Отметьте раскатку и брак ниже.`]); }
      else if (diff < plan) C.push(['', `Напечатано ${num(diff, 0)} — меньше плана ${num(plan, 0)}. Тираж не допечатан?`]);
      else C.push(['ok', `Напечатано ${num(diff, 0)} оттисков, план ${num(plan, 0)} — в норме.`]);
    }
    $('#rCnt').innerHTML = C.map(([k, t]) => `<div class="alert ${k}">${esc(t)}</div>`).join('');
    const sides = f.color === '1+1' ? 2 : 1, extra = diff == null ? null : diff - plan;
    const told = (f.roll + f.brak.reduce((a, b) => a + b.sheets, 0)) * sides;
    $('#rRec').innerHTML = extra != null && extra > 3 && Math.abs(extra - told) > 10 ? `<div class="alert">Лишних оттисков ${num(extra, 0)}, а раскатка и брак дают ${num(told, 0)}. Что это было?</div><textarea id="rNote" rows="2" placeholder="например, проба на другой бумаге" style="width:100%;margin-top:6px">${esc(f.note)}</textarea>` : '';
    $('#rNote')?.addEventListener('input', (e) => { f.note = e.target.value; });
    const mextra = f.masters - mplan - f.mbrak.length;
    $('#rMchk').innerHTML = mextra > 0 ? `<div class="alert">Лишних мастеров ${mextra}${f.mbrak.length ? '' : ', а брака мастеров нет'}. Введите брак мастеров или объясните, почему мастеров столько.</div><input id="rMnote" placeholder="например, два разных макета на одной стороне" value="${esc(f.mnote)}" style="width:100%;margin-top:6px">` : '';
    $('#rMnote')?.addEventListener('input', (e) => { f.mnote = e.target.value; });
    return { diff, bad: C.some(([k]) => k === 'bad') };
  }
  $('#rSave').onclick = async () => {
    const c = check();
    if (!f.blank && !f.title.trim()) return toast('Выберите бланк из каталога или напишите название', 'bad');
    if (!(Number(f.qty) > 0)) return toast('Укажите тираж', 'bad');
    if (c.diff == null || c.bad) return toast('Проверьте счётчик в конце', 'bad');
    try {
      await app.api.risoReport({
        item_id: f.job?.item_id || null, job: f.job ? f.job.job : null,
        blank_id: f.blank?.id || null, title: f.blank ? null : f.title.trim(), fmt: f.fmt, color: f.color, qty: Number(f.qty), paper: f.paper, layouts: f.layouts,
        end_counter: Number(String(f.end).replace(/\s/g, '')), masters: f.masters, roll_sheets: f.roll,
        brak: f.brak.filter((b) => b.sheets > 0), no_brak: f.noBrak, master_brak: f.mbrak, note: f.note, master_note: f.mnote,
      });
      toast('Тираж записан'); f = newForm(); reload(el);
    } catch (e) { toast(errText(e), 'bad'); }
  };
  drawBrak(); drawMbrak(); check();
}

async function drawLog() {
  const log = await app.api.risoJournal().catch(() => []);
  $('#rLog').innerHTML = log.length ? `<table class="t"><thead><tr><th>Когда</th><th>Что</th><th class="n">План / факт</th><th>Раскатка и брак</th></tr></thead><tbody>${log.map((l) => (l.type !== 'run'
    ? `<tr><td class="small muted">${dt(l.at)}</td><td colspan="3" class="small">${esc(l.text)}</td></tr>`
    : `<tr><td class="small muted">${dt(l.at)}</td><td class="small">${esc(l.title)}${l.in_catalog ? '' : ' <span class="chip warn nodot">нет в каталоге</span>'}<div class="muted">${num(l.qty, 0)} шт · мастеров ${l.masters}${l.masters > l.masters_plan ? ` (план ${l.masters_plan})` : ''}</div></td>
      <td class="small n">${num(l.plan, 0)} / ${num(l.printed, 0)}</td>
      <td class="small">раскатка ${l.roll}; брак: ${l.brak.length ? l.brak.map((b) => `${esc(b.comment || b.reason.toLowerCase())} ${b.sheets}`).join(', ') : l.no_brak ? 'нет' : '—'}${l.master_brak.length ? `; испорчено мастеров ${l.master_brak.length}: ${esc(l.master_brak.join('; '))}` : ''}${l.note ? `<div class="muted">${esc(l.note)}</div>` : ''}${l.master_note ? `<div class="muted">мастера: ${esc(l.master_note)}</div>` : ''}</td></tr>`)).join('')}</tbody></table>`
    : '<div class="muted">Пока пусто — отметьте первый тираж.</div>';
}
