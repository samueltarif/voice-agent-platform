import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT_DIR = resolve('.');
const FORBIDDEN_GENERIC_NAMES = new Set([
  'utils.ts',
  'utils.tsx',
  'helpers.ts',
  'helpers.tsx',
  'common.ts',
  'common.tsx',
  'misc.ts',
  'misc.tsx',
  'manager.ts',
  'manager.tsx',
]);
const ALL_APPS = ['web', 'api', 'voice', 'worker'];

let violations = 0;

function isCompositionRoot(filePath) {
  const name = basename(filePath);
  return (
    name.startsWith('bootstrap.') ||
    name.startsWith('composition-root.') ||
    name.startsWith('main.')
  );
}

function checkDisallowedComments(filePath, content) {
  if (/@ts-ignore\b/.test(content)) {
    console.error(`[ERROR] Arquitetura: @ts-ignore e expressamente proibido em '${filePath}'.`);
    violations++;
  }
  if (/@ts-nocheck\b/.test(content)) {
    console.error(`[ERROR] Arquitetura: @ts-nocheck e expressamente proibido em '${filePath}'.`);
    violations++;
  }
  if (
    /\/\*\s*eslint-disable\s*\*\//.test(content) ||
    /\/\/\s*eslint-disable-(next-)?line\s*$/m.test(content)
  ) {
    console.error(
      `[ERROR] Arquitetura: eslint-disable amplo sem regra especifica em '${filePath}'.`,
    );
    violations++;
  }
}

function getImportsFromAST(filePath, fileContent) {
  const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true);
  const specifiers = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function resolveTarget(filePath, specifier) {
  const normalizedSpec = specifier.replace(/\\/g, '/');
  if (normalizedSpec.startsWith('.')) {
    const absTarget = resolve(dirname(join(ROOT_DIR, filePath)), normalizedSpec);
    return relative(ROOT_DIR, absTarget).replace(/\\/g, '/');
  }
  return normalizedSpec;
}

function checkBoundaries(filePath, specifier) {
  const normalizedFile = filePath.replace(/\\/g, '/');
  const target = resolveTarget(filePath, specifier);

  // 1. Cross-app isolation
  for (const app of ALL_APPS) {
    if (normalizedFile.startsWith(`apps/${app}/`)) {
      const otherApps = ALL_APPS.filter((a) => a !== app);
      for (const other of otherApps) {
        if (
          target === `@voice-agent/${other}` ||
          target.startsWith(`@voice-agent/${other}/`) ||
          target.startsWith(`apps/${other}`)
        ) {
          console.error(
            `[ERROR] Fronteira: 'apps/${app}' nao pode importar de 'apps/${other}': '${specifier}'.`,
          );
          violations++;
        }
      }
    }
  }

  // 2. packages/contracts neutrality
  if (normalizedFile.startsWith('packages/contracts/')) {
    const isForbidden =
      target.includes('integrations') ||
      target.includes('database') ||
      target.includes('ui') ||
      target.startsWith('@voice-agent/integrations') ||
      target.startsWith('@voice-agent/database') ||
      target.startsWith('@voice-agent/ui');
    if (isForbidden) {
      console.error(
        `[ERROR] Fronteira: 'packages/contracts' deve ser neutro. Proibido: '${specifier}'.`,
      );
      violations++;
    }
  }

  // 3. packages/integrations only in composition roots
  const isIntegrationsImport =
    target === '@voice-agent/integrations' ||
    target.startsWith('@voice-agent/integrations/') ||
    target.startsWith('packages/integrations');

  if (isIntegrationsImport && !isCompositionRoot(filePath)) {
    console.error(
      `[ERROR] Direcao: '@voice-agent/integrations' permitido apenas em composition roots: '${filePath}'.`,
    );
    violations++;
  }
}

function scanFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (
        !['node_modules', 'dist', '.turbo', 'coverage'].includes(entry.name) &&
        !entry.name.startsWith('.')
      ) {
        scanFiles(fullPath);
      }
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      if (FORBIDDEN_GENERIC_NAMES.has(basename(relPath).toLowerCase())) {
        console.error(
          `[ERROR] Arquivo generico proibido: '${relPath}'. Use nomes com responsabilidade unica.`,
        );
        violations++;
      }
      const content = readFileSync(fullPath, 'utf8');
      checkDisallowedComments(relPath, content);
      for (const imp of getImportsFromAST(relPath, content)) {
        checkBoundaries(relPath, imp);
      }
    }
  }
}

console.log(
  '[architecture-check] Validando arquitetura, limites e diretivas com TypeScript AST...',
);
if (readdirSync(ROOT_DIR).includes('apps')) scanFiles(join(ROOT_DIR, 'apps'));
if (readdirSync(ROOT_DIR).includes('packages')) scanFiles(join(ROOT_DIR, 'packages'));

if (violations > 0) {
  console.error(
    `\n[architecture-check] FALHA: ${violations} violacao(oes) arquitetural(ais) detectada(s)!`,
  );
  process.exit(1);
}
console.log(
  '[architecture-check] SUCESSO: Todas as fronteiras e regras arquiteturais respeitadas.',
);
