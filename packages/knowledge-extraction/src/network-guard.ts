import dgram from 'node:dgram';
import dns from 'node:dns';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

function refuse(): never {
  throw new Error('Network access is disabled in the extraction process');
}

/**
 * Instalada no INÍCIO do processo filho, antes de qualquer parser. Nenhum
 * código de extração precisa de rede; isto é uma camada extra (o modelo de
 * permissões do Node 22/24 não controla rede e não é sandbox — DEC-066).
 */
export function installNetworkGuard(): void {
  const blocked = (() => refuse()) as never;
  globalThis.fetch = blocked;
  (globalThis as { WebSocket?: unknown }).WebSocket = blocked;
  net.Socket.prototype.connect = blocked;
  Object.assign(net, { connect: blocked, createConnection: blocked });
  Object.assign(http, { request: blocked, get: blocked });
  Object.assign(https, { request: blocked, get: blocked });
  Object.assign(http2, { connect: blocked });
  Object.assign(tls, { connect: blocked });
  Object.assign(dgram, { createSocket: blocked });
  Object.assign(dns, { lookup: blocked, resolve: blocked, resolve4: blocked, resolve6: blocked });
  Object.assign(dns.promises, { lookup: blocked, resolve: blocked });
  syncBuiltinESMExports();
}
