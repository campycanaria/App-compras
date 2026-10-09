/* Lógica pura (sin DOM): importes en céntimos, análisis de líneas, fusión de fotos solapadas y reparto. */
(function (root) {
  const L = {};
  const PRICE = /-?\d{1,5}[.,]\d{2}-?(?!\d)/g;
  const DATE = /\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\b\d{1,2}:\d{2}\b/;
  const SKIP = /\b(total|subtotal|entregad[oa]|cambio|efectivo|tarjeta|visa|mastercard|iva|base imp|cuota|operaci[oó]n|ticket|factura|gracias|cajer[oa]|tel[eé]f|cif|nif|a pagar|importe|puntos|saldo|terminal|autoriz\w*)\b/i;
  const DTO = /\b(dto|descuento|desc|oferta|promo\w*|ahorro|cup[oó]n)\b/i;

  // "1.234,56" / "1,5" / "2.50" / "0,30-" -> céntimos enteros (null si no es válido)
  L.toCents = (s) => {
    if (s == null) return null;
    let t = String(s).trim().replace(/\s|€/g, '');
    let neg = t.startsWith('-') || t.endsWith('-');
    t = t.replace(/-/g, '');
    if (!/^\d+([.,]\d{1,2})?$/.test(t) && !/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) return null;
    t = t.replace(/\.(?=\d{3}(\D|$))/g, '');
    const [e, d = ''] = t.replace(',', '.').split('.');
    const c = parseInt(e, 10) * 100 + parseInt((d + '00').slice(0, 2), 10);
    return neg ? -c : c;
  };
  L.fmt = (c) => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2).replace('.', ',') + ' €';

  L.parseLine = (raw, conf) => {
    const t = String(raw).replace(/\s+/g, ' ').trim();
    if (t.length < 3 || SKIP.test(t) || DATE.test(t)) return null;
    const m = t.match(PRICE);
    if (!m) return null;
    const last = m[m.length - 1];
    let cents = L.toCents(last);
    if (cents === null) return null;
    let name = t.slice(0, t.lastIndexOf(last)).trim(), qty = 1, doubt = false, note = '';
    if (m.length >= 2) {
      const u = m[m.length - 2], unit = L.toCents(u);
      const head = t.slice(0, t.indexOf(u)).trim();
      const q = head.match(/(\d+)\s*[xX*]\s*$/);
      if (q && unit !== null) {
        qty = parseInt(q[1], 10); name = head.slice(0, q.index).trim();
        if (Math.abs(qty * unit) !== Math.abs(cents)) { doubt = true; note = 'Cantidad × unidad no coincide con el importe'; }
      }
    }
    const lead = name.match(/^(\d{1,2})\s*[xX]\s+(.+)$/);
    if (lead) { qty = parseInt(lead[1], 10); name = lead[2]; }
    name = name.replace(/[\s|_.\-]+$/, '').replace(/\s+[A-C]$/, '').trim();
    const isDto = cents < 0 || last.endsWith('-') || DTO.test(name);
    if (isDto) cents = -Math.abs(cents);
    if (name.length < 2) { doubt = true; note = note || 'Nombre no reconocido'; }
    if (conf != null && conf < 70) { doubt = true; note = note || 'Reconocimiento poco fiable'; }
    return { name, qty, cents, dto: isDto, doubt, note };
  };

  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  L.sim = (a, b) => {
    a = norm(a); b = norm(b);
    if (!a && !b) return 1;
    const n = a.length, m = b.length;
    let prev = Array.from({ length: m + 1 }, (_, j) => j);
    for (let i = 1; i <= n; i++) {
      const cur = [i];
      for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return 1 - prev[m] / Math.max(n, m);
  };
  const same = (a, b) => a.cents === b.cents && a.qty === b.qty && L.sim(a.name, b.name) >= 0.75;

  // Une las listas de cada foto (en orden). Solo elimina solapes de ≥2 líneas consecutivas coincidentes
  // y no totalmente idénticas entre sí; el resto se conserva y se marca para revisión.
  L.merge = (pages) => {
    let out = [], warns = [];
    pages.forEach((items, pi) => {
      items = items.map((x) => ({ ...x, page: pi + 1 }));
      if (pi === 0) { out = items; return; }
      let k = 0;
      for (let c = Math.min(40, out.length, items.length); c >= 1; c--) {
        let ok = true;
        for (let i = 0; i < c && ok; i++) ok = same(out[out.length - c + i], items[i]);
        if (ok) { k = c; break; }
      }
      if (k === 0) {
        warns.push(`Foto ${pi + 1}: no se detecta solapamiento con la anterior. Puede faltar alguna línea entre ambas.`);
      } else {
        const rep = items.slice(0, k), allEq = rep.every((r) => same(r, rep[0]));
        if (k >= 2 && !allEq) {
          warns.push(`Foto ${pi + 1}: se han eliminado ${k} líneas repetidas del solape (${rep.map((r) => r.name).join(', ')}).`);
          items = items.slice(k);
        } else {
          warns.push(`Foto ${pi + 1}: ${k} línea(s) coincide(n) con el final de la foto anterior, pero no es seguro que sean un solape. Se conservan; elimina las repetidas a mano si procede.`);
          rep.forEach((r) => { r.doubt = true; r.note = 'Posible duplicado por solape'; });
        }
      }
      out = out.concat(items);
    });
    // Descuento justo debajo de un producto -> precio neto del producto
    const res = [];
    out.forEach((it) => {
      const prev = res[res.length - 1];
      if (it.dto && prev && !prev.dto && prev.cents > 0 && prev.cents + it.cents >= 0) {
        prev.dtoCents = (prev.dtoCents || 0) + it.cents; prev.cents += it.cents; prev.dtoName = it.name;
      } else res.push(it);
    });
    res.forEach((r, i) => { r.id = i + 1; r.who = 'S'; });
    return { items: res, warns };
  };

  // who: S compartido, M mío, P pareja. El céntimo impar de lo compartido lo asume quien usa la app (M).
  L.split = (items) => {
    let m = 0, p = 0, s = 0;
    items.forEach((i) => { if (i.who === 'M') m += i.cents; else if (i.who === 'P') p += i.cents; else s += i.cents; });
    const half = Math.trunc(s / 2);
    return { me: m + (s - half), partner: p + half, sum: m + p + s };
  };
  root.Logic = L;
  if (typeof module !== 'undefined') module.exports = L;
})(typeof self !== 'undefined' ? self : this);
