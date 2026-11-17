// SOMENTE TESTES: filho que escreve mais que o teto de saída.
const block = 'x'.repeat(64 * 1024);
const flood = () => process.stdout.write(block, flood);
flood();
