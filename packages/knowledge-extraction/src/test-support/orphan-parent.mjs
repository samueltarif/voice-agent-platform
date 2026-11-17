// SOMENTE TESTES: processo intermediário que inicia o filho (mesmas flags) com
// canal IPC, repassa o PID dele e espera ser morto pelo teste.
import { spawn } from 'node:child_process';

const args = JSON.parse(process.argv[2]);
const child = spawn(process.execPath, args, { env: {}, stdio: ['pipe', 'pipe', 'ignore', 'ipc'] });
child.stdout.once('data', (chunk) => process.stdout.write(chunk));
setInterval(() => {}, 1000);
