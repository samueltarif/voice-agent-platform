// SOMENTE TESTES: filho que fica esperando (assíncrono); sai se o pai morrer
// (canal IPC fechado), como o filho real.
process.on('disconnect', () => process.exit(70));
setInterval(() => {}, 1000);
process.stdout.write(`${JSON.stringify({ pid: process.pid })}\n`);
