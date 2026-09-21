import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT_DIR = resolve('.');
const ALLOWLIST_FILE = join(ROOT_DIR, 'scripts', 'file-size-allowlist.json');

const TARGET_MIN_LINES = 80;
const TARGET_MAX_LINES = 150;
const HARD_MAX_LINES = 180;

let allowlist = [];
let allowlistValidationError = false;

try {
  const content = readFileSync(ALLOWLIST_FILE, 'utf8');
  const parsed = JSON.parse(content);
  const rawEntries = Array.isArray(parsed) ? parsed : parsed.entries || [];

  for (const item of rawEntries) {
    if (item.disabled) continue;

    // Strict validation: AI agents are forbidden from adding entries without human approval metadata
    const approver = String(item.approvedBy || '').trim();
    const isHumanApproved =
      approver.length > 0 &&
      !approver.toLowerCase().includes('agent') &&
      !approver.toLowerCase().includes('ai') &&
      !approver.toLowerCase().includes('llm');

    if (!isHumanApproved || !item.decisionRef) {
      console.error(
        `[ERROR] Allowlist corrompida: '${item.path}' nao possui aprovacao humana formal ('approvedBy' humano e 'decisionRef' sao obrigatorios). Agentes de IA nao podem auto-aprovar excecoes!`,
      );
      allowlistValidationError = true;
    }

    allowlist.push(item);
  }
} catch {
  allowlist = [];
}

const allowlistMap = new Map();
for (const item of allowlist) {
  allowlistMap.set(item.path.replace(/\\/g, '/'), item);
}

function isProductionLogicFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const isSource = normalized.startsWith('apps/') || normalized.startsWith('packages/');
  if (!isSource || !normalized.includes('/src/')) return false;
  if (!/\.(ts|tsx|js|mjs)$/.test(normalized)) return false;

  if (
    normalized.endsWith('.test.ts') ||
    normalized.endsWith('.test.tsx') ||
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.spec.tsx') ||
    normalized.endsWith('.d.ts') ||
    normalized.includes('/__tests__/') ||
    normalized.includes('/fixtures/') ||
    normalized.includes('/mocks/')
  ) {
    return false;
  }

  return true;
}

function scanDir(dir, fileList = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(ROOT_DIR, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (
        !['node_modules', 'dist', '.turbo', 'coverage'].includes(entry.name) &&
        !entry.name.startsWith('.')
      ) {
        scanDir(fullPath, fileList);
      }
    } else if (entry.isFile() && isProductionLogicFile(relPath)) {
      fileList.push({ fullPath, relPath });
    }
  }
  return fileList;
}

const files = scanDir(ROOT_DIR);
let errors = allowlistValidationError ? 1 : 0;
let warnings = 0;

console.log(`[file-size-check] Verificando ${files.length} arquivos de logica de producao...`);

for (const { fullPath, relPath } of files) {
  const content = readFileSync(fullPath, 'utf8');
  const lines = content.split(/\r?\n/).length;
  const allowed = allowlistMap.get(relPath);

  if (lines > HARD_MAX_LINES) {
    if (allowed) {
      console.warn(
        `[WARN] Excecao em allowlist para '${relPath}' (${lines} linhas). Aprovador: ${allowed.approvedBy} (${allowed.decisionRef}): ${allowed.reason}`,
      );
      warnings++;
    } else {
      console.error(
        `[ERROR] Arquivo '${relPath}' possui ${lines} linhas, ultrapassando o teto maximo de ${HARD_MAX_LINES} linhas sem justificativa na allowlist!`,
      );
      errors++;
    }
  } else if (lines > TARGET_MAX_LINES) {
    console.warn(
      `[WARN] Arquivo '${relPath}' possui ${lines} linhas (alvo recomendado: ${TARGET_MIN_LINES}-${TARGET_MAX_LINES} linhas).`,
    );
    warnings++;
  }
}

if (errors > 0) {
  console.error(
    `\n[file-size-check] FALHA: Violacao de tamanho de arquivo ou tentativa de bypass de governanca.`,
  );
  process.exit(1);
} else {
  console.log(
    `[file-size-check] SUCESSO: Todos os arquivos de logica estao em conformidade (${warnings} avisos).`,
  );
}
