// Схема раскроя: рулон вертикально, единый масштаб по обеим осям.
// Рулон заряжается сзади: начало печати (заправка 100 мм) — снизу, конец печати (обрезка 50 мм) — сверху.
// Макеты прижаты к правому краю, Color Bar — на белом поле справа от изображения (отступ 5 мм), перерасход — слева.
// Защитная область принтера (бока, начало, конец) — одна, серая со штрихами.
// У каждого макета: цветное изображение и белое поле вокруг (рамка), оно может заходить на защитную область.
import { esc, num } from './ui.js?v=f8825c7';

const C = {
  roll: '#ffffff', safe: '#e5e7eb', safeLine: '#9ca3af', waste: '#fde7e7',
  frame: '#ffffff', frameLine: '#9ca3af', image: '#ffd84d', imageLine: '#1a1a1a', text: '#6b7280',
  bar: ['#00a3e0', '#e6007e', '#ffe500', '#1a1a1a'],
};

export function schemeSvg(r, printer) {
  const L = r.layout;
  const W = L.rollWidthMm, H = L.rollLengthMm;
  const side = printer.sideMarginMm ?? 0, bar = printer.colorBarEnabled === false ? 0 : (printer.colorBarMm ?? 0);
  const lead = printer.leadMm ?? 0, tail = printer.tailMm ?? 0;
  const R = L.frameMm ?? 0;
  const sw = Math.max(W, H) / 450;          // толщина линий в масштабе
  const font = Math.max(W, H) / 34;
  const pad = font * 2.2;
  const o = [];
  const rect = (x, y, w, h, attrs) => o.push(`<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" ${attrs}/>`);

  // 1. Рулон и защитная область — одна серая штриховка по периметру
  rect(0, 0, W, H, `fill="url(#safe)" stroke="${C.safeLine}" stroke-width="${sw}"`);
  // 2. Печатная зона внутри защитной области (сверху — конец печати, снизу — начало); незанятое — перерасход
  rect(side, tail, W - 2 * side, H - lead - tail, `fill="${C.waste}"`);

  // 3. Макеты прижаты к правому нижнему углу: справа налево, снизу вверх от начала печати
  const right = (L.imageRightMm ?? W - side) + R;     // правый край раскладки (с белым полем)
  const bottom = H - lead + (L.slackLeadMm ?? 0);     // белое поле первого ряда может лечь на начало печати
  const pieces = [];
  if (L.split) {
    for (let k = 0; k < L.rows; k++) pieces.push({ col: 0, row: k, strip: (k % L.strips) + 1 });
  } else {
    let n = 0;
    const total = r.qty ?? 1;
    for (let row = 0; row < L.rows; row++) for (let c = 0; c < L.perRow && n < total; c++, n++) pieces.push({ col: c, row });
  }
  const pw = L.pieceAcrossMm, ph = L.pieceAlongMm;
  for (const p of pieces) { p.x = right - (p.col + 1) * pw; p.y = bottom - (p.row + 1) * ph; }
  const minX = Math.min(right, ...pieces.map((p) => p.x));
  const minY = Math.min(bottom, ...pieces.map((p) => p.y));

  // Слои снизу вверх: Color Bar с белой полосой → белое поле (пунктир) → макет. Макет — главный, его рамка поверх всего.
  // 4. Color Bar — один на ряд, справа от крайнего макета через отступ (белая полоса), четыре полосы C, M, Y, K.
  // На схеме рисуется шириной 20 мм (на деле 10 мм), отступ — 10 мм, чтобы было заметно.
  if (bar > 0 && pieces.length) {
    const imgRight = right - R;
    const gapVis = Math.max(printer.colorBarGapMm ?? 5, 10), barVis = Math.max(bar, 20);
    const y0 = minY + R, y1 = bottom - R;
    rect(imgRight, y0, gapVis, y1 - y0, `fill="#ffffff"`);
    C.bar.forEach((col, i) => rect(imgRight + gapVis + (barVis / 4) * i, y0, barVis / 4, y1 - y0, `fill="${col}"`));
  }

  // 5. Белое поле: только пунктир, без заливки — под ним видна защитная область
  for (const p of pieces) rect(p.x, p.y, pw, ph, `fill="none" stroke="${C.frameLine}" stroke-width="${sw}" stroke-dasharray="${sw * 6} ${sw * 4}"`);

  // 6. Макеты — фактический размер изделия, самый верхний слой
  for (const { x, y, strip } of pieces) {
    rect(x + R, y + R, pw - 2 * R, ph - 2 * R, `fill="${C.image}"`);
    if (strip) {
      // нахлёст на шве: полоса заходит на соседнюю на seamOverlapMm (обычно 10 мм) — у шва справа и/или слева
      const ov = L.seamOverlapMm ?? 0, ix = x + R, iw = pw - 2 * R, ovVis = Math.max(ov, 20); // на схеме — 20 мм, чтобы было видно
      if (ov > 0 && strip < L.strips) rect(ix + iw - ovVis, y + R, ovVis, ph - 2 * R, `fill="url(#overlap)"`);
      if (ov > 0 && strip > 1) rect(ix, y + R, ovVis, ph - 2 * R, `fill="url(#overlap)"`);
      o.push(`<text x="${x + pw / 2}" y="${y + ph / 2}" font-size="${font}" text-anchor="middle" dominant-baseline="middle" fill="#1a1a1a">полоса ${strip}</text>`);
    }
    rect(x + R, y + R, pw - 2 * R, ph - 2 * R, `fill="none" stroke="${C.imageLine}" stroke-width="${sw}"`); // рамка макета поверх всего
  }

  // 7. Подписи
  o.push(`<text x="${W / 2}" y="${-pad / 2.4}" font-size="${font}" text-anchor="middle" fill="${C.text}">рулон ${num(W, 0)} мм · конец печати</text>`);
  o.push(`<text x="${W / 2}" y="${H + pad / 1.5}" font-size="${font}" text-anchor="middle" fill="${C.text}">↓ начало печати · рулон идёт на нас</text>`);
  o.push(`<text x="${W + pad / 2}" y="${H / 2}" font-size="${font}" fill="${C.text}" text-anchor="middle" transform="rotate(90 ${W + pad / 2} ${H / 2})">${num(H, 0)} мм</text>`);
  if (minX - side > font * 4) o.push(`<text x="${(side + minX) / 2}" y="${H - lead - font}" font-size="${font * 0.8}" text-anchor="middle" fill="#b91c1c">перерасход</text>`);

  const hs = sw * 9;
  return `<svg class="scheme" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Схема раскроя">
    <defs><pattern id="safe" width="${hs}" height="${hs}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="${hs}" height="${hs}" fill="${C.safe}"/><line x1="0" y1="0" x2="0" y2="${hs}" stroke="${C.safeLine}" stroke-width="${sw}"/></pattern>
      <pattern id="overlap" width="${hs / 2}" height="${hs / 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="${hs / 2}" height="${hs / 2}" fill="#fb923c"/><line x1="0" y1="0" x2="0" y2="${hs / 2}" stroke="#c2410c" stroke-width="${sw}"/></pattern></defs>
    ${o.join('')}</svg>
    <div class="legend">
      <span><i style="background:repeating-linear-gradient(45deg,#e5e7eb 0 3px,#9ca3af 3px 4px)"></i>защитная область</span>
      <span><i style="background:transparent;border:1px dashed #9ca3af"></i>белое поле${R ? ` ${num(R, 0)} мм` : ''}</span>
      <span><i style="background:#ffd84d;border:1px solid #1a1a1a"></i>макет</span>
      <span><i style="background:linear-gradient(90deg,#00a3e0 25%,#e6007e 25% 50%,#ffe500 50% 75%,#1a1a1a 75%)"></i>Color Bar</span>
      <span><i style="background:#fde7e7;border:1px solid #f5c2c2"></i>перерасход</span>
      ${L.split && L.seamOverlapMm ? `<span><i style="background:repeating-linear-gradient(-45deg,#fb923c 0 3px,#c2410c 3px 4px)"></i>нахлёст ${num(L.seamOverlapMm, 0)} мм</span>` : ''}
    </div>`;
}

export function layoutText(L) {
  const parts = [`${esc(num(L.rollLengthMm / 1000, 2))} пог. м`, `рабочая ширина ${num(L.usableWidthMm, 0)} мм`];
  if (L.split) parts.unshift(`раскрой на ${L.strips} полосы по ${num(L.pieceAcrossMm, 1)}×${num(L.pieceAlongMm, 0)} мм, нахлёст ${num(L.seamOverlapMm ?? 10, 0)} мм`);
  else if (L.perRow > 1) parts.unshift(`${L.perRow} в ряд, рядов ${L.rows}`);
  return parts.join(' · ');
}
