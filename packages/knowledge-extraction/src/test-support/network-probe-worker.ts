import net from 'node:net';
import { parentPort } from 'node:worker_threads';
import { installWorkerNetworkGuard } from '../worker-network-guard.js';

/** SOMENTE TESTES: instala a guarda real e tenta sair para a rede. */
installWorkerNetworkGuard();

async function attempt(action: () => unknown): Promise<boolean> {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
}

const fetchBlocked = await attempt(() => fetch('http://127.0.0.1:9/'));
const socketBlocked = await attempt(() => net.connect({ host: '127.0.0.1', port: 9 }));
parentPort?.postMessage({ fetchBlocked, socketBlocked });
