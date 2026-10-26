// Каркас приложения: вход, меню по правам, маршруты, колокольчик.
import { $, esc, toast, errText, ROLE, dt } from './ui.js?v=f8825c7';
import { renderCalc } from './screens/calc.js?v=f8825c7';
import { renderOrders } from './screens/orders.js?v=f8825c7';
import { renderOrder } from './screens/order.js?v=f8825c7';
import { renderWorkshop } from './screens/workshop.js?v=f8825c7';
import { renderSettings, settingsGroups, settingsGroupOf } from './screens/settings.js?v=f8825c7';
import { renderStock, canOpenStock } from './screens/stock.js?v=f8825c7';
import { renderPayroll } from './screens/payroll.js?v=f8825c7';
import { renderReport } from './screens/report.js?v=f8825c7';
import { renderRiso } from './screens/riso.js?v=f8825c7';
import { renderPoly } from './screens/poly.js?v=f8825c7';

const ICON = {
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4"/>',
  orders: '<path d="M9 4h6l1 2h3v14H5V6h3z"/><path d="M9 11h6M9 15h4"/>',
  work: '<path d="M6 9V4h12v5"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  poly: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14h7M9 17h4"/>',
  riso: '<rect x="4" y="9" width="16" height="9" rx="2"/><path d="M7 9V4h10v5M8 14h8M8 18v2h8v-2"/>',
  report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pay: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  stock: '<path d="M3 8l9-5 9 5v12H3z"/><path d="M7 20v-7h10v7M7 16h10"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

export const app = { api: null, me: null, refs: null };

// Очередь входа внутри одной вкладки. Общая очередь браузера (navigator.locks) делится между вкладками:
// если ERP открыт в соседней вкладке и там она зависла, вход здесь ждал бесконечно.
const tabLocks = new Map();
function tabLock(name, _timeout, fn) {
  const prev = tabLocks.get(name) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  tabLocks.set(name, run.catch(() => {}));
  return run;
}

async function loadApi() {
  if (new URLSearchParams(location.search).has('mock')) {
    // на опубликованный сайт mock-api.js не попадает — объясняем, а не «нет связи»
    const { createMockApi } = await import('./mock-api.js?v=f8825c7').catch(() => { throw new Error('Тестового режима на рабочем сайте нет — он открывается только с компьютера разработки (node tools/serve.mjs). Уберите «?mock=…» из адреса'); });
    return createMockApi(new URLSearchParams(location.search).get('mock') || 'director');
  }
  const [{ createClient }, cfg, { createApi }] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm'),
    import('./config.js?v=f8825c7'),
    import('./api.js?v=f8825c7'),
  ]);
  return createApi(createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { lock: tabLock } }),
    () => createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'erp-aux', lock: tabLock } }));
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('сервер не ответил за 20 секунд. Проверьте интернет и попробуйте ещё раз')), ms))]);

function renderLogin(msg = '') {
  $('#root').innerHTML = `
    <div class="login"><form class="card" id="lf">
      <div class="mark">🖨</div>
      <h2 style="margin:0 0 4px">ERP · Производство</h2>
      <div class="muted small" style="margin-bottom:16px">Вход для сотрудников</div>
      <div class="field"><label>Почта</label><input name="email" type="email" autocomplete="username" required></div>
      <div class="field" style="margin-top:10px"><label>Пароль</label><input name="pw" type="password" autocomplete="current-password" required></div>
      ${msg ? `<div class="alert bad">${esc(msg)}</div>` : ''}
      <button class="btn primary" style="width:100%;margin-top:16px">Войти</button>
    </form></div>`;
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    e.target.querySelector('button').disabled = true;
    try { await withTimeout(app.api.signIn(f.get('email'), f.get('pw')), 20000); await start(); }
    catch (err) { renderLogin(errText(err)); }
  });
}

// Разделы меню (владелец 2026-10-26): у раздела с несколькими направлениями — подвкладки вверху страницы.
// count — какое число очереди показать (nav_counts, миграция 021); remember — открывать подвкладку, где был в прошлый раз.
function sections() {
  const m = app.me;
  const list = [];
  // подвкладки «Расчёта» — по правам на направления (у каждого сотрудника свои, миграция 022)
  const calcSubs = [m.perm('calc_wide') && ['calc', 'Широкоформатная печать'], m.perm('calc_poly') && ['poly', 'Полиграфия']].filter(Boolean);
  if (m.perm('see_prices') && calcSubs.length) list.push({ key: 'calc', title: 'Расчёт', icon: 'calc', subs: calcSubs });
  if (m.perm('see_prices')) list.push({ key: 'orders', title: 'Заказы', icon: 'orders', subs: [['orders', 'Заказы']], count: ['orders'] });
  if (m.perm('print_work')) list.push({ key: 'work', title: 'Цех', icon: 'work', remember: true, count: ['wide', 'riso'],
    subs: [['workshop', 'Широкоформатная печать', 'wide'], ['riso', 'Ризограф', 'riso']] });
  if (m.perm('see_stock') || m.perm('stock_in') || m.perm('stock_off')) list.push({ key: 'stock', title: 'Склад', icon: 'stock', subs: [['stock', 'Рулоны']] });
  if (m.perm('see_cost')) list.push({ key: 'report', title: 'Отчёт', icon: 'report', subs: [['report', 'Отчёт']] });
  if (m.role !== 'agent') list.push({ key: 'payroll', title: 'Зарплата', icon: 'pay', subs: [['payroll', 'Зарплата']] });
  if (m.perm('settings') || m.perm('nomenclature')) list.push({ key: 'settings', title: 'Настройки', icon: 'set', subs: settingsGroups().map(([k, t]) => ['settings/' + k, t]) });
  return list;
}
// первое доступное направление расчёта: для стартового экрана и кнопки «+»
const firstCalc = () => (app.me.perm('see_prices') ? (app.me.perm('calc_wide') ? 'calc' : app.me.perm('calc_poly') ? 'poly' : null) : null);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* без хранилища — просто не запомним */ } } };
// Число очереди: срочные — «1!» красным, обычные — нейтрально, вместе «1! + 5»
export function countBadge(c) {
  if (!c) return '';
  const u = Number(c.urgent) || 0, n = Number(c.normal) || 0;
  if (!u && !n) return '';
  return `<span class="nbadge">${[u ? `<b class="u">${u}!</b>` : '', n ? `<b>${n}</b>` : ''].filter(Boolean).join('<i>+</i>')}</span>`;
}
let counts = {};
const sumCounts = (keys) => keys.reduce((a, k) => ({ urgent: a.urgent + (Number(counts[k]?.urgent) || 0), normal: a.normal + (Number(counts[k]?.normal) || 0) }), { urgent: 0, normal: 0 });
async function refreshCounts() {
  try { counts = (await app.api.navCounts()) || {}; } catch { return; }
  for (const sec of sections()) if (sec.count) { const el = document.querySelector(`#nav a[data-r="${sec.key}"] .cnt`); if (el) el.innerHTML = countBadge(sumCounts(sec.count)); }
  document.querySelectorAll('#subtabs a[data-c]').forEach((a) => { a.querySelector('.cnt').innerHTML = countBadge(counts[a.dataset.c]); });
}

function shell() {
  $('#root').innerHTML = `
    <div class="app">
      <aside class="side">
        <div class="brand"><div class="mark">🖨</div><div>ERP · Производство<div class="muted small" style="font-weight:600">${esc(ROLE[app.me.role])}</div></div></div>
        <nav class="nav" id="nav">${sections().map((x) => `<a href="#/${x.remember ? x.key : x.subs[0][0]}" data-r="${x.key}">${svg(x.icon)}<span>${x.title}</span><span class="cnt"></span></a>`).join('')}</nav>
        <div class="who">${esc(app.me.full_name)}<br><a href="#" id="logout">Выйти</a></div>
      </aside>
      <main class="main">
        <div class="top"><h1 id="title"></h1>
          ${firstCalc() ? `<a class="iconbtn plus" href="#/${firstCalc()}" title="Новый расчёт">+</a>` : ''}
          ${['director', 'manager'].includes(app.me.role) ? `<button class="iconbtn" id="bellBtn" title="Уведомления">${svg('bell')}<span class="dot hidden" id="bellDot"></span></button>` : ''}
        </div>
        <div id="subtabs"></div>
        <div id="screen"></div>
      </main>
    </div>`;
  $('#logout').addEventListener('click', async (e) => { e.preventDefault(); await withTimeout(app.api.signOut(), 10000).catch(() => {
    // сервер не ответил — забываем вход в этой вкладке сами
    try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch {}
  });
  location.hash = ''; location.reload(); });
  $('#bellBtn')?.addEventListener('click', toggleBell);
}

export function setTitle(t) { $('#title').textContent = t; document.title = t + ' · ERP РПК'; }

async function route() {
  const [, r = '', arg] = (location.hash || '').split('/');
  const def = firstCalc() || (app.me.perm('see_prices') ? 'orders' : 'work');
  let name = r || def;
  // «Цех» открывается на подвкладке, где был в прошлый раз
  if (name === 'work') { const last = store.get('erp.work'); name = ['workshop', 'riso'].includes(last) ? last : 'workshop'; history.replaceState(null, '', '#/' + name); }
  if (['workshop', 'riso'].includes(name)) store.set('erp.work', name);
  const route0 = name === 'settings' ? 'settings/' + settingsGroupOf(arg) : name === 'order' ? 'orders' : name;
  const sec = sections().find((x) => x.subs.some(([k]) => k === route0));
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === sec?.key));
  $('#subtabs').innerHTML = sec && sec.subs.length > 1 ? `<div class="subtabs">${sec.subs.map(([k, t, c]) => `<a href="#/${k}" class="${k === route0 ? 'on' : ''}" ${c ? `data-c="${c}"` : ''}>${t}<span class="cnt">${c ? countBadge(counts[c]) : ''}</span></a>`).join('')}</div>` : '';
  const el = $('#screen');
  el.innerHTML = '<div class="muted">Загрузка…</div>';
  try {
    // расчёт и цех работают со складом (рулоны, обрезки) — берём свежие данные, а не со входа
    if (['calc', 'workshop', 'poly'].includes(name)) app.refs = await app.api.refs();
    if (name === 'calc' && app.me.perm('see_prices') && app.me.perm('calc_wide')) await renderCalc(el, arg);
    else if (name === 'orders' && app.me.perm('see_prices')) await renderOrders(el);
    else if (name === 'order' && arg) await renderOrder(el, arg);
    else if (name === 'workshop' && app.me.perm('print_work')) await renderWorkshop(el);
    else if (name === 'stock' && canOpenStock()) await renderStock(el, arg);
    else if (name === 'report' && app.me.perm('see_cost')) await renderReport(el);
    else if (name === 'riso' && app.me.perm('print_work')) await renderRiso(el);
    else if (name === 'poly' && app.me.perm('see_prices') && app.me.perm('calc_poly')) await renderPoly(el);
    else if (name === 'payroll' && app.me.role !== 'agent') await renderPayroll(el);
    else if (name === 'settings' && (app.me.perm('settings') || app.me.perm('nomenclature'))) await renderSettings(el, arg);
    else location.hash = '#/' + def;
  } catch (e) {
    el.innerHTML = `<div class="alert bad">Не удалось открыть экран: ${esc(errText(e))}</div>`;
  }
  refreshCounts();
}

// ---------- колокольчик ----------
let bellItems = [];
async function refreshBell() {
  if (!$('#bellDot')) return;
  try {
    bellItems = await app.api.notifications();
    const n = bellItems.filter((x) => !x.read_at).length;
    $('#bellDot').textContent = n;
    $('#bellDot').classList.toggle('hidden', !n);
  } catch { /* без связи — попробуем позже */ }
}
function bellHtml() {
  const unread = bellItems.filter((x) => !x.read_at).length;
  const head = unread ? `<div class="bell-head"><span class="muted small">Непрочитанных: ${unread}</span>
    <button class="btn sm" data-readall="1">Отметить все прочитанными</button></div>` : '';
  const list = bellItems.length ? bellItems.map((n) => `
    <div class="n" data-o="${n.order_id || ''}" data-c="${n.category_id || ''}" data-id="${n.id}">
      <div style="font-weight:${n.read_at ? 500 : 800}">${esc(n.text)}</div>
      <div class="muted small">${dt(n.created_at)}${n.read_at ? ' · прочитано' : ''}</div>
      ${n.actionable && n.approval_id && app.me.perm('approve') ? `<div class="acts">
        <button class="btn sm primary" data-ap="${n.approval_id}" data-v="1">Подтвердить</button>
        <button class="btn sm bad" data-ap="${n.approval_id}" data-v="0">Отклонить</button></div>` : ''}
      ${n.read_at ? '' : `<div class="acts"><button class="btn sm" data-read="${n.id}">Отметить прочитанным</button></div>`}
    </div>`).join('') : '<div class="n muted">Уведомлений нет</div>';
  return head + list;
}
async function markBellRead(ids) {
  const t = new Date().toISOString();
  bellItems.forEach((x) => { if (ids.includes(x.id)) x.read_at = t; });
  await Promise.all(ids.map((id) => app.api.markRead(id).catch(() => {})));
}
function toggleBell() {
  const old = $('#bell');
  if (old) { old.remove(); return; }
  const box = document.createElement('div');
  box.className = 'bell'; box.id = 'bell';
  box.innerHTML = bellHtml();
  box.addEventListener('click', async (e) => {
    const redraw = async () => { await refreshBell(); box.innerHTML = bellHtml(); };
    const ap = e.target.closest('[data-ap]');
    if (ap) {
      e.stopPropagation();
      const id = ap.closest('.n').dataset.id;
      try { await app.api.decideApproval(ap.dataset.ap, ap.dataset.v === '1'); toast(ap.dataset.v === '1' ? 'Подтверждено' : 'Отклонено'); }
      catch (err) { toast(errText(err), 'bad'); }
      await markBellRead([id]);
      box.remove(); await refreshBell(); route();
      return;
    }
    if (e.target.closest('[data-readall]')) {
      await markBellRead(bellItems.filter((x) => !x.read_at).map((x) => x.id));
      await redraw(); return;
    }
    const one = e.target.closest('[data-read]');
    if (one) { await markBellRead([one.dataset.read]); await redraw(); return; }
    const n = e.target.closest('.n[data-id]');
    if (n) {
      await markBellRead([n.dataset.id]);
      box.remove(); refreshBell();
      if (n.dataset.o) location.hash = '#/order/' + n.dataset.o;
      else if (n.dataset.c) location.hash = '#/stock/' + n.dataset.c; // рекомендация цены: карточка материала на складе
    }
  });
  $('.main').append(box);
}

async function start() {
  app.me = await app.api.me();
  if (!app.me) { renderLogin('Нет профиля сотрудника. Обратитесь к директору'); return; }
  app.refs = await app.api.refs();
  shell();
  window.onhashchange = route;
  await route();
  await refreshBell();
  setInterval(() => { refreshBell(); refreshCounts(); }, 30000);
}

(async () => {
  try {
    app.api = await loadApi();
    if (await app.api.session()) await start(); else renderLogin();
  } catch (e) {
    $('#root').innerHTML = `<div class="login"><div class="card"><div class="alert bad">${esc(errText(e))}</div></div></div>`;
  }
})();
