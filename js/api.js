// Слой данных: всё общение с Supabase в одном месте.
// Экраны работают только через эти функции, поэтому для проверок их можно подменить (mock-api.js).

const ok = ({ data, error }) => { if (error) throw error; return data; };
// Часовой пояс компьютера: отчёт и зарплата считают дни по местному времени
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';

// Закупка рулона хранится отдельно: таблица её не отдаёт, функция roll_costs — только тем, кому положено
const ROLL_COLS = 'id, article, material_id, width_mm, length_initial_mm, length_left_mm, purchase_date, supplier, doc_ref, status, inventory_at, comment, created_at';
// Закупка 1 м² печатного материала и рекомендации цены — тоже только через функцию (миграция 016)
const CAT_COLS = 'id, name, kind, price_print_sqm, price_waste_sqm, split_allowed, seam_glue, white_margin_mm, allowed_options, offcut_min_w_mm, offcut_min_l_mm, active, price_mode, markup_print_pct, markup_waste_pct';
const COLS = { material_categories: CAT_COLS };
const withCatCosts = (cats, costs) => {
  const m = new Map((costs || []).map((c) => [c.id, c]));
  return cats.map((c) => {
    const x = m.get(c.id) || {};
    return { ...c, base_cost_sqm: x.base_cost_sqm ?? null, current_cost_sqm: x.current_cost_sqm ?? null, rec_print_sqm: x.rec_print_sqm ?? null,
      rec_waste_sqm: x.rec_waste_sqm ?? null, rec_basis: x.rec_basis ?? null, rec_at: x.rec_at ?? null, cost_basis: x.cost_basis ?? null };
  });
};
const withCosts = (rolls, costs) => {
  const m = new Map((costs || []).map((c) => [c.id, c]));
  return rolls.map((r) => ({ ...r, purchase_total: m.get(r.id)?.purchase_total ?? null, cost_sqm: m.get(r.id)?.cost_sqm ?? null }));
};

// makeAuxClient — отдельное подключение без сохранения входа: им директор заводит нового сотрудника,
// не выходя из своего аккаунта.
export function createApi(sb, makeAuxClient) {
  return {
    // ---------- настройки и справочники (экран «Настройки») ----------
    async list(table, order = null) {
      let q = sb.from(table).select(COLS[table] || '*');
      if (order) q = q.order(order);
      const rows = ok(await q);
      return table === 'material_categories' ? withCatCosts(rows, ok(await sb.rpc('category_costs'))) : rows;
    },
    async insertRow(table, row) { return ok(await sb.from(table).insert(row).select(COLS[table] || '*').single()); },
    // рекомендация цены печатного материала: принять или оставить как есть
    async acceptPriceRec(catId) { ok(await sb.rpc('accept_price_rec', { p_cat: catId })); },
    async dismissPriceRec(catId) { ok(await sb.rpc('dismiss_price_rec', { p_cat: catId })); },
    async updateRow(table, idField, id, patch) { ok(await sb.from(table).update(patch).eq(idField, id)); },
    async deleteRow(table, idField, id) { ok(await sb.from(table).delete().eq(idField, id)); },
    async setSettings(pairs, by) {
      const rows = Object.entries(pairs).map(([key, value]) => ({ key, value, updated_by: by, updated_at: new Date().toISOString() }));
      if (rows.length) ok(await sb.from('settings').upsert(rows));
    },
    async setOptionGoods(code, links) {
      ok(await sb.from('option_goods').delete().eq('option_code', code));
      if (links.length) ok(await sb.from('option_goods').insert(links.map((l) => ({ ...l, option_code: code }))));
    },
    async settingsLog() {
      return ok(await sb.from('settings_log').select('*').order('changed_at', { ascending: false }).limit(100));
    },
    async createEmployee({ email, password, full_name, role, phone }) {
      const aux = makeAuxClient();
      const { data, error } = await aux.auth.signUp({ email, password });
      if (error) throw error;
      const id = data.user?.id;
      if (!id) throw new Error('сотрудник не создан');
      return ok(await sb.from('profiles').insert({ id, full_name, role, phone: phone || null }).select().single());
    },

    // ---------- вход ----------
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { await sb.auth.signOut(); },
    async session() { return (await sb.auth.getSession()).data.session; },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s)); },

    async me() {
      const uid = (await sb.auth.getUser()).data.user?.id;
      if (!uid) return null;
      const p = ok(await sb.from('profiles').select('id, full_name, role, perms, active').eq('id', uid).maybeSingle());
      if (!p) return null;
      const rp = ok(await sb.from('role_perms').select('perm').eq('role', p.role)).map((r) => r.perm);
      const perm = (k) => p.role === 'director' || (k in (p.perms || {}) ? !!p.perms[k] : rp.includes(k));
      return { ...p, perm };
    },

    // ---------- справочники для калькулятора ----------
    async refs() {
      const [settings, categories, materials, rolls, options, printers, kits, methods, goods, optionGoods, costs, catCosts] = await Promise.all([
        sb.from('settings').select('key, value'),
        sb.from('material_categories').select(CAT_COLS).eq('active', true).order('name'),
        sb.from('materials').select('*').eq('active', true),
        sb.rpc('calc_rolls'),   // рулоны для расчёта: без поставщика и цен (агенту склад не виден, миграция 022)
        sb.from('options').select('*').eq('active', true),
        sb.from('printers').select('*').eq('active', true).order('name'),
        sb.from('kits').select('*').eq('active', true).order('sort'),
        sb.from('payment_methods').select('*').eq('active', true).order('sort'),
        sb.from('goods').select('*').eq('active', true).order('name'),
        sb.from('option_goods').select('*'),
        sb.rpc('roll_costs'),
        sb.rpc('category_costs'),
      ]).then((rs) => rs.map(ok));
      // обрезки видят не все (агент — нет): без права список просто пустой
      const offcuts = ok(await sb.from('offcuts').select('id, roll_id, width_mm, length_mm, roll:rolls(article, material_id)').eq('status', 'available'));
      const cost = new Map((costs || []).map((c) => [c.id, c.cost_sqm]));
      return { settings: Object.fromEntries(settings.map((s) => [s.key, s.value])), categories: withCatCosts(categories, catCosts), materials, rolls: withCosts(rolls || [], costs), options, printers, kits, methods, goods, optionGoods,
        offcuts: (offcuts || []).map((o) => ({ ...o, cost_sqm: cost.get(o.roll_id) ?? null })) };
    },

    async staff() { return ok(await sb.rpc('staff_names')); },

    // ---------- клиенты ----------
    async findClients(q) {
      const s = q.trim();
      if (!s) return [];
      return ok(await sb.from('clients').select('id, name, phone, email').or(`name.ilike.%${s}%,phone.ilike.%${s}%`).limit(10));
    },
    async createClient(c) { return ok(await sb.from('clients').insert(c).select().single()); },

    // ---------- заказы ----------
    async saveDraft(id, order, items) {
      let oid = id;
      if (!oid) oid = ok(await sb.from('orders').insert(order).select('id').single()).id;
      else ok(await sb.from('orders').update(order).eq('id', oid));
      // замена позиций одним действием в базе: если новые не сохранились, старые остаются
      ok(await sb.rpc('replace_order_items', { p_order: oid, p_items: items }));
      return oid;
    },
    // полиграфия: заказ и позиции (миграция 020); позиции меняются одним действием в базе
    async savePoly(id, order, items) {
      let oid = id;
      if (!oid) oid = ok(await sb.from('orders').insert(order).select('id').single()).id;
      else ok(await sb.from('orders').update(order).eq('id', oid));
      ok(await sb.rpc('replace_poly_items', { p_order: oid, p_items: items }));
      return oid;
    },
    async addCalcVersion(orderId, snapshot) { ok(await sb.from('order_calc_versions').insert({ order_id: orderId, snapshot })); },
    async placeOrder(id, patch) { return ok(await sb.from('orders').update({ ...patch, status: 'placed' }).eq('id', id).select('id, number').single()); },
    async listOrders({ status, q } = {}) {
      let r = sb.from('orders').select('id, number, status, urgency, total, created_at, due_at, client:clients(name), manager_id, poly:poly_items(count)').neq('status', 'draft').order('created_at', { ascending: false }).limit(200);
      if (status) r = r.eq('status', status);
      if (q) r = r.ilike('number', `%${q}%`);
      return ok(await r).map((o) => ({ ...o, poly_count: o.poly?.[0]?.count ?? 0 }));
    },
    async navCounts() { return ok(await sb.rpc('nav_counts')); },
    async getOrder(id) {
      const [o, items, pays, hist, appr, brak, poly] = await Promise.all([
        sb.from('orders').select('*, client:clients(*), printer:printers(name)').eq('id', id).single(),
        sb.from('order_items').select('*, category:material_categories(name), roll:rolls(article, width_mm)').eq('order_id', id).order('position'),
        sb.from('payments').select('*').eq('order_id', id).order('received_at'),
        sb.from('order_history').select('*').eq('order_id', id).order('at', { ascending: false }),
        sb.from('approvals').select('*').eq('order_id', id).order('created_at', { ascending: false }),
        sb.from('brak').select('*, item:order_items!inner(order_id, position)').eq('item.order_id', id).order('created_at'),
        sb.from('poly_items').select('*').eq('order_id', id).order('position'),
      ]).then((rs) => rs.map(ok));
      return { ...o, items, payments: pays, history: hist, approvals: appr, brak, poly };
    },
    async setStatus(id, status) { ok(await sb.from('orders').update({ status }).eq('id', id)); },
    async updateOrder(id, patch) { ok(await sb.from('orders').update(patch).eq('id', id)); },
    async updateItem(id, patch) { ok(await sb.from('order_items').update(patch).eq('id', id)); },
    async addPayment(orderId, method, amount, receivedBy) {
      ok(await sb.from('payments').insert({ order_id: orderId, method, amount, received_by: receivedBy }));
    },

    // ---------- склад ----------
    // ---------- ризограф ----------
    async risoStatus() { return ok(await sb.rpc('riso_status')); },
    async risoQueue() { return ok(await sb.rpc('riso_queue')); },
    async risoJournal() { return ok(await sb.rpc('riso_journal', { p_limit: 60 })); },
    async risoReport(p) { return ok(await sb.rpc('riso_report', { p })); },
    async risoChangeTube(ended, left, newId, at) { ok(await sb.rpc('riso_change_tube', { p_ended: ended, p_left: left, p_new: newId, p_at: at })); },
    async risoChangeFilm(at) { ok(await sb.rpc('riso_change_film', { p_at: at })); },
    async risoAlign(copy, master, reason) { ok(await sb.rpc('riso_align', { p_copy: copy, p_master: master, p_reason: reason })); },
    async risoReceiveTubes(count, putIn) { return ok(await sb.rpc('riso_receive_tubes', { p_count: count, p_put_in: putIn })).map((r) => r.riso_receive_tubes ?? r); },
    async blankCatalog() { return ok(await sb.from('blank_catalog_view').select('*').eq('status', 'active').order('serial')); },

    // ---------- зарплата и отчёт директора ----------
    async payrollSummary(from, to) { return ok(await sb.rpc('payroll_summary', { p_from: from, p_to: to, p_tz: TZ })); },
    async payrollEntries(employeeId, from, to) {
      const start = new Date(from + 'T00:00:00').toISOString(), end = new Date(new Date(to + 'T00:00:00').getTime() + 864e5).toISOString();
      return ok(await sb.from('payroll_entries').select('*').eq('employee_id', employeeId).gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }));
    },
    async addPayrollEntry(employeeId, amount, comment) { ok(await sb.from('payroll_entries').insert({ employee_id: employeeId, kind: 'manual', amount, comment })); },
    async directorReport(from, to) { return ok(await sb.rpc('director_report', { p_from: from, p_to: to, p_tz: TZ })); },
    async reportBrak(itemId, mm, reason, comment, lesson, reprint = true) { return ok(await sb.rpc('report_brak', { p_item: itemId, p_mm: mm, p_reason: reason, p_comment: comment, p_lesson: lesson, p_reprint: reprint })); },
    async decideBrak(id, fault) { ok(await sb.rpc('decide_brak', { p_brak: id, p_fault: fault })); },
    async stock() {
      const [materials, rolls, costs, offcuts] = await Promise.all([
        sb.from('materials').select('*').eq('active', true).order('name'),
        sb.from('rolls').select(ROLL_COLS).neq('status', 'written_off').order('purchase_date'),
        sb.rpc('roll_costs'),
        sb.from('offcuts').select('*').eq('status', 'available').order('created_at', { ascending: false }),
      ]).then((rs) => rs.map(ok));
      return { materials, rolls: withCosts(rolls, costs), offcuts };
    },
    async stockMoves(rollId = null) {
      let q = sb.from('stock_moves').select('*, roll:rolls(article, material_id)').order('created_at', { ascending: false }).limit(300);
      if (rollId) q = q.eq('roll_id', rollId);
      return ok(await q);
    },
    async receiveRolls(doc, date, supplier, lines) { return ok(await sb.rpc('receive_rolls', { p_doc: doc, p_date: date, p_supplier: supplier, p_lines: lines })); },
    async writeoffRoll(id, mm, reason) { return ok(await sb.rpc('writeoff_roll', { p_roll: id, p_mm: mm, p_reason: reason })); },
    async inventoryRoll(id, factMm, comment = null) { return ok(await sb.rpc('inventory_roll', { p_roll: id, p_fact_mm: factMm, p_comment: comment })); },
    async addOffcut(rollId, w, l, itemId = null) { return ok(await sb.rpc('add_offcut', { p_roll: rollId, p_w: w, p_l: l, p_item: itemId })); },
    async writeoffOffcut(id, reason) { ok(await sb.rpc('writeoff_offcut', { p_offcut: id, p_reason: reason })); },
    async moveRoll(rollId, catId) { return ok(await sb.rpc('move_roll', { p_roll: rollId, p_cat: catId })); },
    async setLowStock(materialId, mm) { ok(await sb.from('materials').update({ low_stock_mm: mm }).eq('id', materialId)); },
    async addInkEvent(ev) { ok(await sb.from('ink_events').insert(ev)); },
    async inkEvents() { return ok(await sb.from('ink_events').select('*').order('happened_at', { ascending: false }).limit(100)); },
    async inkPeriods() { return ok(await sb.from('ink_periods').select('*').order('started_at', { ascending: false })); },

    // ---------- цех ----------
    async workshopQueue() { return ok(await sb.rpc('workshop_queue')); },
    async useOffcut(itemId, offcutId) { ok(await sb.rpc('workshop_use_offcut', { p_item: itemId, p_offcut: offcutId })); },
    async setItemStatus(itemId, status) { ok(await sb.rpc('workshop_set_item_status', { p_item: itemId, p_status: status })); },

    // ---------- уведомления ----------
    async notifications() {
      return ok(await sb.from('notifications').select('*').is('resolved_at', null).order('created_at', { ascending: false }).limit(30));
    },
    async markRead(id) { ok(await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)); },
    async decideApproval(id, approve) { ok(await sb.rpc('decide_approval', { p_approval: id, p_approve: approve })); },
  };
}
