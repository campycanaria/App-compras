// Ejecutar: node tests/test.js
const L = require('../logic.js'); const assert = require('assert');
const parse = (a) => a.map((l) => L.parseLine(l)).filter(Boolean);
// Ticket de ejemplo dividido en 3 fotos con solapes de 3 y 2 líneas. Hay un producto repetido legítimo (AGUA 1,5L).
const f1 = ['MERCADONA S.A.', 'LECHE ENTERA 1L 1,05', 'AGUA 1,5L 0,55', 'PAN BARRA 0,45', 'YOGUR NATURAL 3 x 0,85 2,55', 'QUESO TIERNO 3,20', 'DTO OFERTA QUESO -0,70'];
const f2 = ['PAN BARRA 0,45', 'YOGUR NATURAL 3 x 0,85 2,55', 'QUESO TIERNO 3,20', 'DTO OFERTA QUESO -0,70', 'AGUA 1,5L 0,55', 'TOMATE RAMA 1,99'];
const f3 = ['AGUA 1,5L 0,55', 'TOMATE RAMA 1,99', 'POLLO ASADO 5,10', 'DEVOLUCION BOLSA -0,10', 'TOTAL 16,23', 'TARJETA 16,23', '12/03/2026 18:44'];
const { items, warns } = L.merge([parse(f1), parse(f2), parse(f3)]);
const names = items.map((i) => i.name);
assert.strictEqual(names.filter((n) => /AGUA/.test(n)).length, 2, 'agua repetida legítima se conserva');
assert.strictEqual(names.filter((n) => /TOMATE/.test(n)).length, 1);
assert.strictEqual(items.find((i) => /QUESO/.test(i.name)).cents, 250, 'descuento aplicado al neto');
assert.strictEqual(items.find((i) => /YOGUR/.test(i.name)).qty, 3);
const total = items.reduce((a, i) => a + i.cents, 0);
console.log(warns.join('\n')); console.log(items.map((i) => i.name + ' ' + L.fmt(i.cents)).join('\n'), '\nSuma', L.fmt(total));
assert.strictEqual(L.toCents('1.234,56'), 123456); assert.strictEqual(L.toCents('0,3'), 30); assert.strictEqual(L.toCents('2.5'), 250);
// Céntimos impares: compartido 5,01 -> yo 2,51 / pareja 2,50, la suma es exacta
items.forEach((i, n) => { i.who = n === 0 ? 'M' : n === 1 ? 'P' : 'S'; });
const r = L.split(items); assert.strictEqual(r.me + r.partner, total);
assert.deepStrictEqual(L.split([{ cents: 501, who: 'S' }]), { me: 251, partner: 250, sum: 501 });
console.log('OK: todas las pruebas pasan');
