// SOMENTE TESTES: worker que esgota o heap, para o teto de memória do V8.
const retained = [];
for (;;) retained.push(new Array(1_000_000).fill(retained.length));
