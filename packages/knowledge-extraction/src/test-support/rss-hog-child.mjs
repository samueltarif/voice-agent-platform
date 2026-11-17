// SOMENTE TESTES: filho que cresce FORA do heap (buffers), para a medição de RSS.
const retained = [];
setInterval(() => retained.push(Buffer.alloc(64 * 1024 * 1024, 1)), 20);
