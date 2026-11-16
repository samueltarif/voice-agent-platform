// Pré-carregado SÓ no smoke test da API compilada (check-api-dist-startup.mjs).
// Bloqueia e registra qualquer conexão de saída que não seja loopback e qualquer
// fetch: o smoke prova que iniciar a API não chama provedores, webhooks ou rede.
import net from 'node:net';

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function hostOf(args) {
  // `net.connect` repassa os argumentos já normalizados como um array.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === 'object') return first.host ?? first.path ?? 'localhost';
  return typeof args[1] === 'string' ? args[1] : 'localhost';
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const host = String(hostOf(args));
  if (!LOOPBACK.has(host) && !host.startsWith('/') && !host.startsWith('\\\\')) {
    process.stderr.write(`EGRESS_BLOCKED socket ${host}\n`);
    throw new Error('Egress blocked by API smoke test');
  }
  return originalConnect.apply(this, args);
};

globalThis.fetch = async (input) => {
  process.stderr.write(`EGRESS_BLOCKED fetch ${String(input).slice(0, 80)}\n`);
  throw new Error('fetch blocked by API smoke test');
};
