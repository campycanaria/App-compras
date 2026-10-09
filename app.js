(() => {
const L = Logic, $ = (s) => document.querySelector(s), app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let S = { stage: 'home', total: null, imgs: [], items: [], warns: [], nid: 1 }, saved = false, busy = null;

// ---------- IndexedDB ----------
const db = new Promise((ok, ko) => { const r = indexedDB.open('tickets', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
const idb = async (m, ...a) => { const d = await db; return new Promise((ok, ko) => { const q = d.transaction('k', m === 'get' ? 'readonly' : 'readwrite').objectStore('k')[m](...a); q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error); }); };
const save = () => idb('put', S, 'ticket').catch(() => toast('No se pudo guardar el progreso en este dispositivo'));
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); setTimeout(() => e.classList.remove('on'), 2600); }

// ---------- Vistas ----------
function render() {
  ({ home: home, setup: setup, review: review, result: result })[S.stage]();
}
function home() {
  app.innerHTML = `<h1>Reparto de tickets</h1><p>Fotografía el ticket, asigna cada producto y sabe cuánto paga cada uno.</p>
  <button class="btn" id="n">Nuevo ticket</button>${saved ? '<button class="btn sec" id="c">Continuar ticket</button>' : ''}`;
  $('#n').onclick = async () => { if (saved && !confirm('Ya hay un ticket pendiente. ¿Descartarlo y empezar otro?')) return; S = { stage: 'setup', total: null, imgs: [], items: [], warns: [], nid: 1 }; await save(); saved = true; render(); };
  if (saved) $('#c').onclick = async () => { S = await idb('get', 'ticket'); render(); };
}
function setup() {
  const th = S.imgs.map((im, i) => `<div class="th"><img src="${URL.createObjectURL(im.blob)}" data-v="${i}" alt="Foto ${i + 1}"><span>Foto ${i + 1}</span>
    <button class="ib" data-u="${i}" aria-label="Subir">▲</button><button class="ib" data-d="${i}" aria-label="Bajar">▼</button><button class="ib" data-x="${i}" aria-label="Eliminar">✕</button></div>`).join('');
  app.innerHTML = `<h1>Nuevo ticket</h1><h2>Total del ticket</h2>
  <input type="text" id="tot" inputmode="decimal" class="big" placeholder="0,00 €" value="${S.total != null ? (S.total / 100).toFixed(2).replace('.', ',') : ''}">
  <h2>Fotos del ticket</h2><p>Hazlas en orden, de arriba abajo. Deja unas líneas solapadas entre una y otra.</p>
  <label class="btn">📷 Hacer foto<input type="file" accept="image/*" capture="environment" id="cam" hidden></label>
  <div class="row"><label class="btn sec">Galería<input type="file" accept="image/*" multiple id="gal" hidden></label><label class="btn sec">PDF<input type="file" accept="application/pdf" id="pdf" hidden></label></div>
  <div class="thumbs">${th}</div>
  ${busy ? `<div class="bar"><i style="width:${busy.p}%"></i></div><p>${esc(busy.t)}</p>` : `<button class="btn" id="go" ${S.imgs.length && S.total ? '' : 'disabled'}>Analizar ${S.imgs.length || ''} foto(s)</button>`}
  <button class="btn sec" id="h">Volver al inicio</button>`;
  $('#tot').onchange = (e) => { S.total = L.toCents(e.target.value); if (S.total === null) toast('Importe no válido'); save(); setup(); };
  const add = async (files) => { for (const f of files) S.imgs.push({ id: S.nid++, blob: f }); await save(); setup(); };
  $('#cam').onchange = (e) => add(e.target.files); $('#gal').onchange = (e) => add(e.target.files);
  $('#pdf').onchange = (e) => pdfToImages(e.target.files[0]);
  app.querySelectorAll('[data-v]').forEach((e) => e.onclick = () => openViewer(+e.dataset.v));
  app.querySelectorAll('[data-x]').forEach((e) => e.onclick = () => { S.imgs.splice(+e.dataset.x, 1); save(); setup(); });
  app.querySelectorAll('[data-u],[data-d]').forEach((e) => e.onclick = () => { const i = +(e.dataset.u ?? e.dataset.d), j = e.dataset.u != null ? i - 1 : i + 1; if (j < 0 || j >= S.imgs.length) return; [S.imgs[i], S.imgs[j]] = [S.imgs[j], S.imgs[i]]; save(); setup(); });
  $('#h').onclick = () => { S.stage = 'home'; render(); };
  if ($('#go')) $('#go').onclick = analyze;
}
function review() {
  const sp = L.split(S.items), diff = S.total - sp.sum, doubts = S.items.filter((i) => i.doubt).length, can = diff === 0 && !doubts;
  const rows = S.items.map((it) => `<div class="item ${it.who} ${it.doubt ? 'doubt' : ''}" data-id="${it.id}">
    <div class="r1"><input type="text" data-f="name" value="${esc(it.name)}"><input type="number" class="q" data-f="qty" value="${it.qty}" min="1" inputmode="numeric"><input type="text" class="pr" data-f="cents" inputmode="decimal" value="${(it.cents / 100).toFixed(2).replace('.', ',')}"></div>
    ${it.dtoCents ? `<div class="note">Incluye descuento ${L.fmt(it.dtoCents)} (${esc(it.dtoName)})</div>` : ''}
    ${it.doubt ? `<div class="note">⚠ ${esc(it.note || 'Revisar')} <button class="ib" data-ok>Está bien</button></div>` : ''}
    <div class="seg">${[['S', 'Compartido'], ['M', 'Mío'], ['P', 'Pareja']].map(([w, t]) => `<button data-w="${w}" class="${it.who === w ? 'on' : ''}">${t}</button>`).join('')}<button class="ib" data-del style="grid-column:1/-1">Eliminar línea</button></div></div>`).join('');
  app.innerHTML = `<h1>Revisión</h1>${S.warns.map((w) => `<div class="warn">${esc(w)}</div>`).join('')}
  <div class="row"><button class="btn sec" id="v">Ver fotos</button><button class="btn sec" id="add">+ Producto</button></div>${rows}
  <div class="sum"><div class="ln"><span>Total introducido</span><span>${L.fmt(S.total)}</span></div><div class="ln"><span>Total calculado</span><span>${L.fmt(sp.sum)}</span></div>
  <div class="ln st ${diff ? 'bad' : 'ok'}"><span>${diff === 0 ? 'Ticket cuadrado' : diff > 0 ? 'Faltan' : 'Sobran'}</span><span>${diff ? L.fmt(Math.abs(diff)) : '✓'}</span></div>
  ${doubts ? `<div class="note bad">Quedan ${doubts} línea(s) dudosa(s) por revisar. Un total que coincide no garantiza que el ticket esté bien leído.</div>` : ''}
  <button class="btn" id="fin" ${can ? '' : 'disabled'}>Ver reparto</button></div>`;
  app.querySelectorAll('.item').forEach((el) => {
    const it = S.items.find((x) => x.id === +el.dataset.id);
    el.querySelectorAll('[data-f]').forEach((i) => i.onchange = () => {
      const f = i.dataset.f;
      if (f === 'cents') { const c = L.toCents(i.value); if (c === null) return toast('Importe no válido'); it.cents = c; }
      else if (f === 'qty') it.qty = Math.max(1, parseInt(i.value) || 1); else it.name = i.value;
      it.doubt = false; save(); review();
    });
    el.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { it.who = b.dataset.w; save(); review(); });
    const ok = el.querySelector('[data-ok]'); if (ok) ok.onclick = () => { it.doubt = false; save(); review(); };
    el.querySelector('[data-del]').onclick = () => { S.items = S.items.filter((x) => x !== it); save(); review(); };
  });
  $('#v').onclick = () => openViewer(0);
  $('#add').onclick = () => { S.items.push({ id: S.nid++, name: 'Producto nuevo', qty: 1, cents: 0, who: 'S', doubt: true, note: 'Añadido a mano: indica el precio' }); save(); review(); window.scrollTo(0, document.body.scrollHeight); };
  $('#fin').onclick = () => { S.stage = 'result'; save(); render(); };
}
function result() {
  const sp = L.split(S.items), r = (t, c) => `<div class="res">${t}<b>${L.fmt(c)}</b><button class="btn sec" data-c="${(c / 100).toFixed(2).replace('.', ',')}">Copiar ${(c / 100).toFixed(2).replace('.', ',')}</button></div>`;
  app.innerHTML = `<h1>Reparto</h1>${r('Total del ticket', S.total)}${r('Me corresponde pagar', sp.me)}${r('Le corresponde a mi pareja', sp.partner)}
  <p>El céntimo sobrante de lo compartido lo asumo yo. ${L.fmt(sp.me)} + ${L.fmt(sp.partner)} = ${L.fmt(sp.me + sp.partner)}.</p>
  <button class="btn sec" id="b">Volver a revisar</button><button class="btn danger" id="del">Borrar ticket</button>`;
  app.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => navigator.clipboard?.writeText(b.dataset.c).then(() => toast('Copiado'), () => toast('No se pudo copiar')));
  $('#b').onclick = () => { S.stage = 'review'; save(); render(); };
  $('#del').onclick = async () => { if (!confirm('¿Borrar el ticket y sus fotos de este teléfono?')) return; await idb('delete', 'ticket'); saved = false; S = { stage: 'home', total: null, imgs: [], items: [], warns: [], nid: 1 }; render(); };
}

// ---------- Visor ----------
function openViewer(i) {
  const v = $('#viewer'); let z = 100, urls = S.imgs.map((m) => URL.createObjectURL(m.blob));
  const draw = () => { v.innerHTML = `<div class="sc"><img src="${urls[i]}" style="width:${z}%"></div><div class="tb"><button data-a="p">◀</button><span style="align-self:center;color:var(--fg)">${i + 1}/${urls.length}</span><button data-a="n">▶</button><button data-a="-">−</button><button data-a="+">+</button><button data-a="x">Cerrar</button></div>`;
    v.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => { const a = b.dataset.a; if (a === 'x') { v.hidden = true; urls.forEach(URL.revokeObjectURL); return; } if (a === 'p') i = Math.max(0, i - 1); if (a === 'n') i = Math.min(urls.length - 1, i + 1); if (a === '+') z = Math.min(500, z + 50); if (a === '-') z = Math.max(100, z - 50); draw(); }); };
  if (!urls.length) return toast('No hay fotos'); v.hidden = false; draw();
}

// ---------- PDF ----------
const loadScript = (src) => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
async function pdfToImages(f) {
  if (!f) return;
  try {
    busy = { p: 5, t: 'Leyendo PDF…' }; setup();
    if (!window.pdfjsLib) await loadScript('vendor/pdf/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
    for (let n = 1; n <= pdf.numPages; n++) {
      const pg = await pdf.getPage(n), vp = pg.getViewport({ scale: 2.5 }), c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      S.imgs.push({ id: S.nid++, blob: await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)) });
      busy = { p: (n / pdf.numPages) * 100, t: `PDF: página ${n}/${pdf.numPages}` }; setup();
    }
  } catch (e) { toast('No se pudo leer el PDF'); }
  busy = null; await save(); setup();
}

// ---------- OCR ----------
async function toCanvas(blob) {
  let bmp; try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { bmp = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(blob); }); }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, 2200 / w, 6000 / h);
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const x = c.getContext('2d'); x.filter = 'grayscale(1) contrast(1.4)'; x.drawImage(bmp, 0, 0, c.width, c.height); return c;
}
async function analyze() {
  const abs = (p) => new URL(p, location.href).href, n = S.imgs.length, pages = [], msgs = [];
  try {
    busy = { p: 2, t: 'Cargando motor de reconocimiento…' }; setup();
    if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
    let cur = 0;
    const worker = await Tesseract.createWorker('spa', 1, { workerPath: abs('vendor/tesseract/worker.min.js'), corePath: abs('vendor/tesseract'), langPath: abs('vendor/lang'), gzip: true, cacheMethod: 'none',
      logger: (m) => { if (m.status === 'recognizing text') { busy = { p: ((cur + m.progress) / n) * 100, t: `Leyendo foto ${cur + 1} de ${n}…` }; setup(); } } });
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    for (; cur < n; cur++) {
      const { data } = await worker.recognize(await toCanvas(S.imgs[cur].blob));
      const items = (data.lines || []).map((l) => L.parseLine(l.text, l.confidence)).filter(Boolean);
      if (items.length < 2 || data.confidence < 60) msgs.push(`Foto ${cur + 1}: lectura poco fiable (${items.length} líneas, confianza ${Math.round(data.confidence)} %). Puede estar borrosa, girada o con poca luz; repítela si es posible.`);
      pages.push(items);
    }
    await worker.terminate();
    const r = L.merge(pages); S.items = r.items.map((i) => ({ ...i, id: S.nid++ })); S.warns = msgs.concat(r.warns); S.stage = 'review';
    if (!S.items.length) S.warns.unshift('No se ha reconocido ningún producto. Añádelos a mano o repite las fotos.');
  } catch (e) { console.error(e); toast('Error en el reconocimiento. Inténtalo de nuevo.'); }
  busy = null; await save(); render();
}

// ---------- Arranque ----------
(async () => {
  try { const t = await idb('get', 'ticket'); saved = !!t && (t.imgs?.length || t.items?.length || t.total); } catch {}
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
