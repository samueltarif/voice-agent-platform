import dgram from 'node:dgram';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { installNetworkGuard } from '../network-guard.js';
import { readExtractionJob } from '../read-extraction-job.js';
import { extractByFormat } from '../extract-by-format.js';

/**
 * SOMENTE TESTES: mesmo caminho do filho real, mas CONTA tentativas de rede
 * (antes da guarda bloquear) e confere que a guarda lança erro.
 */
let attempts = 0;
const counting = <T extends (...args: never[]) => unknown>(fn: T) =>
  ((...args: Parameters<T>) => {
    attempts += 1;
    return fn(...args);
  }) as T;
installNetworkGuard();
globalThis.fetch = counting(globalThis.fetch);
net.Socket.prototype.connect = counting(net.Socket.prototype.connect);

/** Cada API de rede deve LANÇAR erro dentro do filho. */
async function guardBlocks(): Promise<Record<string, boolean>> {
  const before = attempts;
  const probes: Record<string, () => unknown> = {
    fetch: () => fetch('http://198.51.100.7/'),
    net: () => net.connect(80, '198.51.100.7'),
    http: () => http.request('http://198.51.100.7/'),
    https: () => https.get('https://198.51.100.7/'),
    tls: () => tls.connect(443, '198.51.100.7'),
    dns: () => dns.lookup('example.com', () => undefined),
    dgram: () => dgram.createSocket('udp4'),
  };
  const result: Record<string, boolean> = {};
  for (const [name, probe] of Object.entries(probes)) {
    try {
      await probe();
      result[name] = false;
    } catch {
      result[name] = true;
    }
  }
  attempts = before;
  return result;
}

const job = await readExtractionJob(process.stdin, 16 * 1024 * 1024);
const reply = await extractByFormat(job.header, job.bytes);
const audit = { attempts, guardBlocks: await guardBlocks(), reply };
process.stdout.write(`${JSON.stringify({ ok: true, text: JSON.stringify(audit) })}\n`, () =>
  process.exit(0),
);
