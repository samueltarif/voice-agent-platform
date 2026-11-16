import net from 'node:net';

/**
 * Executado no início do worker de extração: nenhum código ali precisa de rede.
 * Bloqueia `fetch` e conexões de socket (HTTP/HTTPS/TLS usam `net`) DENTRO do
 * worker, como defesa extra contra um parser que tente acessar a rede.
 */
export function installWorkerNetworkGuard(): void {
  const refuse = () => {
    throw new Error('Network access is disabled in the extraction worker');
  };
  globalThis.fetch = (async () => refuse()) as typeof fetch;
  net.Socket.prototype.connect = function blockedConnect() {
    return refuse();
  } as typeof net.Socket.prototype.connect;
}
