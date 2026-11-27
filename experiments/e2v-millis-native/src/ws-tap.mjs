/**
 * E2-V — escuta passiva do WebSocket criado pelo SDK oficial.
 *
 * O SDK consome internamente `clear`, `pause`, `unpause`, `start_answering` e
 * `pong` (não os emite como eventos). Para observá-los sem reescrever o SDK,
 * o construtor global `WebSocket` é envolvido ANTES de `client.start(...)`:
 * cada quadro recebido/enviado ao endpoint da Millis é copiado para o
 * registro e repassado intacto. Outros endereços não são tocados.
 */

export function installWebSocketTap(scope, log, { endpointPrefix }) {
  const Original = scope.WebSocket;
  if (!Original) throw new Error('WebSocket indisponível neste ambiente');
  if (Original.__e2vTap) return () => {};

  function TappedWebSocket(url, protocols) {
    const socket = protocols === undefined ? new Original(url) : new Original(url, protocols);
    if (!String(url).startsWith(endpointPrefix)) return socket;
    log.record('LOCAL', 'ws_connecting', { url: String(url) });
    socket.addEventListener('open', () => log.record('DERIVED', 'ws_open'));
    socket.addEventListener('message', (event) => log.frame('in', event.data));
    socket.addEventListener('close', (event) =>
      log.record('DERIVED', 'ws_close', { code: event.code, reason: event.reason }),
    );
    socket.addEventListener('error', () => log.record('DERIVED', 'ws_error'));
    const send = socket.send.bind(socket);
    socket.send = (data) => {
      log.frame('out', data);
      return send(data);
    };
    return socket;
  }
  TappedWebSocket.prototype = Original.prototype;
  for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'])
    TappedWebSocket[key] = Original[key];
  TappedWebSocket.__e2vTap = true;
  scope.WebSocket = TappedWebSocket;
  return () => {
    scope.WebSocket = Original;
  };
}
