# Reparto de tickets (PWA)

Todo funciona en local: OCR (Tesseract.js + datos en español) y PDF (PDF.js) van incluidos en `vendor/`. Sin servidores, claves ni suscripciones.

## Probar en local
`python3 -m http.server 8080` dentro de esta carpeta y abre http://localhost:8080 (el service worker exige https o localhost). Tests: `node tests/test.js`.

## GitHub Pages
1. Crea un repositorio público y sube todo el contenido de esta carpeta a la raíz.
2. Settings → Pages → Deploy from branch → `main` / `(root)`.
3. Abre `https://TU_USUARIO.github.io/TU_REPO/` una vez con conexión y espera a que cargue (precacha ~12 MB). Después funciona sin conexión.

## Instalar
- Android (Samsung): Chrome o Samsung Internet → menú ⋮ → «Instalar aplicación» / «Añadir a pantalla de inicio».
- iPhone: Safari → Compartir → «Añadir a pantalla de inicio».

## Reglas de fiabilidad
- Importes en céntimos enteros. Compartido: se suma todo lo compartido y se divide una vez; el céntimo impar lo paga el usuario.
- Solape entre fotos: solo se borran ≥2 líneas consecutivas coincidentes (nombre con tolerancia a errores OCR + importe + cantidad) que no sean todas idénticas. Si hay 1 sola coincidencia o líneas idénticas, se conservan y se marcan como dudosas. Si no hay solape, avisa de posible línea perdida.
- «Ver reparto» solo se activa con diferencia 0,00 € y sin líneas dudosas pendientes.

## Limitaciones
- El OCR de Tesseract falla con fotos borrosas o torcidas; la app lo avisa por foto, pero conviene revisar siempre. Haz las fotos rectas y con luz.
- Si la primera línea de una foto queda cortada por el borde, puede no detectarse el solape: la app lo marcará como posible línea perdida.
- Los datos viven en el navegador: si iOS lo limpia por inactividad prolongada, se perdería un ticket pendiente.
