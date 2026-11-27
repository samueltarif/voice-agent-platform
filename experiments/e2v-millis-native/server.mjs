/**
 * E2-V — servidor estático LOCAL (só 127.0.0.1). Serve a página e o pacote
 * gerado por `npm run build`. Não tem rota de API, não recebe webhooks e não
 * guarda nada. Microfone exige origem segura: `http://127.0.0.1` é aceita
 * pelos navegadores.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.E2V_PORT ?? 5173);
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const ROUTES = {
  '/': ['web/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['dist/app.js', 'text/javascript; charset=utf-8'],
};

export function createLocalServer() {
  return createServer(async (req, res) => {
    const route = ROUTES[new URL(req.url, `http://${HOST}`).pathname];
    if (req.method !== 'GET' || !route) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(ROOT + route[0]);
      res.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' }).end(body);
    } catch {
      res.writeHead(500).end('Execute "npm run build" antes de "npm start".');
    }
  });
}

if (process.argv[1]?.endsWith('server.mjs')) {
  createLocalServer().listen(PORT, HOST, () => console.log(`E2-V em http://${HOST}:${PORT}`));
}
