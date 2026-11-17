// SOMENTE TESTES: filho que esgota o heap do V8 (--max-old-space-size).
const retained = [];
for (;;) retained.push(new Array(1_000_000).fill(retained.length));
