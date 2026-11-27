/**
 * E2-V — escuta passiva do WebSocket criado pelo SDK oficial.
 *
 * O SDK consome internamente `clear`, `pause`, `unpause`, `start_answering` e
 * `pong` (não os emite como eventos). Para observá-los sem reescrever o SDK,
 * o construtor global `WebSocket` é envolvido ANTES de `client.start(...)`:
 * cada quadro recebido/enviado ao endpoint da Millis é copiado para o
 * registro e repassado intacto. Outros endereços não são tocados.
 *
 * Correção do 2º experimento real: a instalação repetida (nova sessão após
 * uma conexão recusada) devolvia um no-op e o envoltório continuava ligado ao
 * registro ANTIGO — a sessão nova ficava só com eventos locais/derivados.
 * Agora o envoltório é único, mas o registro de destino é trocado a cada
 * instalação; cada socket fica preso ao registro da sessão que o criou.
 */

function observe(socket, url, log) {
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
}

export function installWebSocketTap(scope, log, { endpointPrefix }) {
  const current = scope.WebSocket;
  if (!current) throw new Error('WebSocket indisponível neste ambiente');
  if (current.__e2vTap) {
    current.__e2vTap.target = { log, endpointPrefix };
    return current.__e2vTap.uninstall;
  }
  const Original = current;
  const tap = { target: { log, endpointPrefix } };

  function TappedWebSocket(url, protocols) {
    const socket = protocols === undefined ? new Original(url) : new Original(url, protocols);
    const { log: sink, endpointPrefix: prefix } = tap.target;
    if (sink && String(url).startsWith(prefix)) observe(socket, url, sink);
    return socket;
  }
  TappedWebSocket.prototype = Original.prototype;
  for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
    TappedWebSocket[key] = Original[key];
  }
  tap.uninstall = () => {
    if (scope.WebSocket === TappedWebSocket) scope.WebSocket = Original;
  };
  TappedWebSocket.__e2vTap = tap;
  scope.WebSocket = TappedWebSocket;
  return tap.uninstall;
}
