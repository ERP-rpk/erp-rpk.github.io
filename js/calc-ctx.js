// Перевод данных из базы в формат расчётного ядра.
import { DEFAULT_SETTINGS } from './calc-core.js?v=f8825c7';

const n = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));

export function calcSettings(s) {
  const inkMl = n(s.ink_norm_ml_sqm, 20), inkPrice = n(s.ink_price_ml_rub, 4.5);
  return {
    ...DEFAULT_SETTINGS,
    seamOverlapMm: n(s.seam_overlap_mm, 10),
    eyeletStepMm: n(s.eyelet_step_mm, 300),
    eyeletEdgeMm: n(s.eyelet_edge_mm, 15),
    pocketMm: n(s.pocket_mm, 50),
    gluePerimeterMm: n(s.glue_perimeter_mm, 50),
    stretcherMm: n(s.stretcher_mm, 25),
    roundLengthMm: n(s.round_length_mm, 50),
    roundPriceRub: n(s.round_price_rub, 5),
    minPrintPriceRub: n(s.min_print_price_rub, 150),
    discountMaxPct: n(s.discount_max_pct, 15),
    urgency: {
      standard: { pct: 0, min: 0 },
      express: { pct: n(s.urgency_express_pct, 50), min: n(s.urgency_express_min, 500) },
      urgent: { pct: n(s.urgency_urgent_pct, 100), min: n(s.urgency_urgent_min, 1000) },
    },
    taxUsnPct: n(s.tax_usn_pct, 7),
    inkCostSqm: inkMl * inkPrice,
  };
}

export const toCategory = (c) => ({
  id: c.id, name: c.name, kind: c.kind,
  pricePrintSqm: Number(c.price_print_sqm), priceWasteSqm: Number(c.price_waste_sqm),
  splitAllowed: c.split_allowed, seamGlue: c.seam_glue, whiteMarginMm: c.white_margin_mm,
  allowedOptions: c.allowed_options || [],
  offcutMin: c.offcut_min_w_mm ? [c.offcut_min_w_mm, c.offcut_min_l_mm] : null,
});

export const toPrinter = (p) => ({
  id: p.id, name: p.name, maxPrintWidthMm: p.max_print_width_mm, sideMarginMm: p.side_margin_mm, edgeMinMm: p.edge_min_mm ?? 20,
  leadMm: p.lead_mm, tailMm: p.tail_mm, colorBarMm: p.color_bar_mm ?? 0, colorBarEnabled: p.color_bar_enabled !== false, colorBarGapMm: p.color_bar_gap_mm ?? 5,
  headCost: p.head_cost ? Number(p.head_cost) : 0, headResourceSqm: p.head_resource_sqm ? Number(p.head_resource_sqm) : 0,
});

// Рулоны категории с себестоимостью 1 м²
export function rollsFor(refs, categoryId) {
  const mats = new Map(refs.materials.filter((m) => m.category_id === categoryId).map((m) => [m.id, m]));
  return refs.rolls.filter((r) => mats.has(r.material_id)).map((r) => ({
    id: r.id, article: r.article, materialId: r.material_id, materialName: mats.get(r.material_id).name,
    widthMm: r.width_mm, leftMm: r.length_left_mm, purchaseDate: r.purchase_date,
    costSqm: Number(r.purchase_total) / ((r.width_mm / 1000) * (r.length_initial_mm / 1000)),
  }));
}

// Обрезки категории на складе (свободные). Рулон, с которого обрезок, может быть уже закончен.
export function offcutsFor(refs, categoryId) {
  const mats = new Set(refs.materials.filter((m) => m.category_id === categoryId).map((m) => m.id));
  return (refs.offcuts || []).filter((o) => mats.has(o.roll?.material_id)).map((o) => ({
    id: o.id, widthMm: o.width_mm, lengthMm: o.length_mm, rollId: o.roll_id, article: o.roll.article, materialId: o.roll.material_id,
    costSqm: o.cost_sqm != null ? Number(o.cost_sqm) : null,
  }));
}

// Услуги постпечати с материалами, которые они списывают (люверсы, ПВХ, рейка, скотч, клей)
export function optionPrices(refs) {
  const goods = new Map((refs.goods || []).map((g) => [g.id, g]));
  return Object.fromEntries(refs.options.map((o) => [o.code, {
    name: o.name, unit: o.unit, price: Number(o.price), min: Number(o.min_price), cost: 0,
    goods: (refs.optionGoods || []).filter((l) => l.option_code === o.code && goods.has(l.good_id)).map((l) => {
      const g = goods.get(l.good_id);
      return { name: g.name, unit: g.unit, qtyPerUnit: Number(l.qty_per_unit), basis: l.basis || 'unit', price: Number(g.price_rub ?? 0), cost: Number(g.purchase_price ?? 0) };
    }),
  }]));
}

export function makeCtx(refs, categoryRow, printerRow) {
  return {
    category: toCategory(categoryRow),
    printer: toPrinter(printerRow),
    rolls: rollsFor(refs, categoryRow.id),
    offcuts: offcutsFor(refs, categoryRow.id),
    optionPrices: optionPrices(refs),
    settings: calcSettings(refs.settings),
  };
}
