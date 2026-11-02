// Мелкие помощники интерфейса: элементы, форматирование, всплывающие сообщения, окна.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Числа в полях ввода: разряды через пробел (1 450 000), чтобы нули не сливались
export const fmtIn = (v) => (v == null || v === '' || isNaN(Number(v)) ? (v ?? '') : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 4 }));
export const parseIn = (s) => String(s ?? '').replace(/[\s  ]/g, '').replace(',', '.');
export function numInputs(root) {
  root.querySelectorAll('input[data-num]').forEach((inp) => {
    inp.value = fmtIn(parseIn(inp.value));
    inp.addEventListener('focus', () => { inp.value = parseIn(inp.value); });
    inp.addEventListener('blur', () => { inp.value = fmtIn(parseIn(inp.value)); });
  });
}

// Материал считаем с шагом 50 мм (решение владельца 2026-10-25): списание — вверх, остаток и обрезок — вниз.
// Точно так же округляет база; здесь — только чтобы сразу показать, что будет учтено.
export const MM_STEP = 50;
export const mmUp = (v) => Math.ceil(v / MM_STEP) * MM_STEP;
export const mmDown = (v) => Math.floor(v / MM_STEP) * MM_STEP;
export function roundHint(root, sel, mode) {
  root.querySelectorAll(sel).forEach((inp) => {
    const h = document.createElement('div');
    h.className = 'muted small rh';
    inp.after(h);
    const upd = () => {
      const v = Math.round(Number(parseIn(inp.value)));
      const r = mode === 'up' ? mmUp(v) : mmDown(v);
      h.textContent = v > 0 && r !== v ? `учтём ${r.toLocaleString('ru-RU')} мм — шаг 50 мм` : '';
    };
    inp.addEventListener('input', upd); upd();
  });
}
export const rub = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ₽');
export const num = (n, d = 2) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d }));
export const mm = (n) => num(n, 0) + ' мм';
export const sqm = (n) => num(n, 2) + ' м²';
export const dt = (s) => (s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export function toast(text, kind = '') {
  let box = $('#toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.append(box); }
  box.className = 'toast show ' + kind;
  box.textContent = text;
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.remove('show'), 3500);
}

// Окно поверх экрана. Возвращает элемент содержимого и функцию закрытия.
export function modal(html, { wide = false } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog">${html}</div>`;
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });
  document.body.append(ov);
  return { el: ov.firstElementChild, close };
}

// Текст ошибки для человека: код и понятное сообщение без технических подробностей
export function errText(e) {
  const m = String(e?.message || e || 'неизвестная ошибка');
  const code = m.match(/E\d\d:[^\n]*/);
  if (code) return code[0];
  if (/Invalid login credentials/i.test(m)) return 'Неверная почта или пароль';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Нет связи с сервером. Проверьте интернет';
  if (/row-level security/i.test(m)) return 'Нет прав на это действие';
  if (/rate limit/i.test(m)) return 'Supabase временно не отправляет письма (лимит бесплатной почты). Попробуйте позже или отключите подтверждение почты';
  if (/not authorized|confirmation email|sending.*email/i.test(m)) return 'Supabase не смог отправить письмо-подтверждение на эту почту (бесплатная почта Supabase пишет только участникам проекта)';
  if (/already registered|already been registered/i.test(m)) return 'Пользователь с такой почтой уже есть';
  if (/password/i.test(m) && /least|short|weak/i.test(m)) return 'Слишком простой пароль: нужно не меньше 8 знаков';
  return m;
}

export const STATUS = {
  draft: 'Черновик', placed: 'Оформлен', layout_approved: 'Макет согласован', printing: 'В печати',
  postprint: 'Постпечать', ready: 'Готов', issued: 'Выдан', cancelled: 'Отменён',
};
export const STATUS_FLOW = ['placed', 'layout_approved', 'printing', 'postprint', 'ready', 'issued'];
export const ITEM_STATUS = { queue: 'В очереди', print: 'В печати', printed: 'Напечатано', post: 'Постобработка', ready: 'Готово' };
export const URGENCY = { standard: 'Стандарт', express: 'Экспресс', urgent: 'Срочно' };
export const ROLE = { director: 'Директор', manager: 'Менеджер', printer: 'Печатник', agent: 'Агент' };
export const PERMS = [
  ['calc_wide', 'Расчёт: широкоформатная печать'], ['calc_poly', 'Расчёт: полиграфия'],
  ['see_prices', 'Видеть цены и клиентов'], ['see_cost', 'Видеть себестоимость и закупку'], ['see_stock', 'Видеть остатки склада'],
  ['take_payment', 'Принимать оплату'], ['give_discount', 'Давать скидку (выше лимита — через директора)'],
  ['approve', 'Подтверждать скидки и отрицательную маржу'], ['stock_in', 'Приход материала'], ['stock_off', 'Списание и инвентаризация'],
  ['nomenclature', 'Вести материалы, цены и комплекты'], ['print_work', 'Работать в цеху'], ['brak_fault', 'Решать, чей брак'],
  ['settings', 'Менять настройки ERP'],
];
