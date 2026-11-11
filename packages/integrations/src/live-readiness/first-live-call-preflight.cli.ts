import { readLiveTestEnvironment } from './first-live-call-environment.js';
import { evaluateFirstLiveCallPreflight } from './first-live-call-preflight.js';

/**
 * 008-OF6 — Diagnóstico da primeira chamada real, VALUE-BLIND e SEM REDE.
 * Uso (Windows/PowerShell, na raiz da worktree): `pnpm preflight:live-test`.
 * Lê apenas variáveis já presentes na sessão do terminal (não abre `.env`).
 * Saída: JSON com status por checagem; código 0 = pronto, 2 = bloqueado.
 */
const report = evaluateFirstLiveCallPreflight(readLiveTestEnvironment(process.env));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.live === 'READY_FOR_OPERATOR_CONTROLLED_PROVIDER_VALIDATION' ? 0 : 2;
