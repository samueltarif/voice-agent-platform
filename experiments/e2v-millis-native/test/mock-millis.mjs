/**
 * Socket SIMULADO da Millis para os testes (nenhuma rede). Reproduz a
 * sequência de quadros observada no SDK oficial e no jambonz.
 */
export class MockSocket extends EventTarget {
  static OPEN = 1;
  static instances = [];

  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    MockSocket.instances.push(this);
  }

  send(data) {
    this.sent.push(data);
  }

  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }

  receive(data) {
    const event = new Event('message');
    event.data =
      typeof data === 'string' || data instanceof ArrayBuffer ? data : JSON.stringify(data);
    this.dispatchEvent(event);
  }

  close(code = 1000) {
    this.readyState = 3;
    const event = new Event('close');
    Object.assign(event, { code, reason: '' });
    this.dispatchEvent(event);
  }
}

/** Conversa típica com interrupção (barge-in) e ferramenta. */
export const SCRIPTED_SESSION = [
  { method: 'onready' },
  { method: 'start_answering' },
  new ArrayBuffer(640),
  new ArrayBuffer(640),
  { method: 'onresponsetext', data: 'Olá, tudo bem?', payload: { is_final: true } },
  { method: 'ontranscript', data: 'quero', payload: { is_final: false } },
  { method: 'clear' },
  { method: 'ontranscript', data: 'quero um contato de teste', payload: { is_final: true } },
  { method: 'pause' },
  { method: 'ai_action', data: { name: 'e2v_registrar_interesse_teste' } },
  { method: 'unpause' },
  new ArrayBuffer(320),
  { method: 'onsessionended' },
];
