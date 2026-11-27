/**
 * E2-V — junta o registro exportado da página (eventos da Millis) e o JSONL
 * do webhook numa linha do tempo única, ordenada pelo horário de parede.
 * Uso: node tools/merge-timeline.mjs <e2v-sessao.json> <webhook.jsonl> [saida.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';

export function mergeTimeline(pageExport, webhookEntries) {
  const page = pageExport.entries.map((entry) => ({
    wall: entry.wall,
    source: 'PAGE',
    origin: entry.origin,
    type: entry.type,
    data: entry.data,
  }));
  const hook = webhookEntries.map(({ wall, kind, ...rest }) => ({
    wall,
    source: 'WEBHOOK',
    origin: 'WEBHOOK',
    type: kind,
    data: rest,
  }));
  return [...page, ...hook].sort((a, b) => a.wall.localeCompare(b.wall));
}

export function parseJsonl(text) {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

if (process.argv[1]?.endsWith('merge-timeline.mjs')) {
  const [pageFile, hookFile, out = 'timeline.json'] = process.argv.slice(2);
  if (!pageFile || !hookFile)
    throw new Error(
      'uso: node tools/merge-timeline.mjs <pagina.json> <webhook.jsonl> [saida.json]',
    );
  const merged = mergeTimeline(
    JSON.parse(readFileSync(pageFile, 'utf8')),
    parseJsonl(readFileSync(hookFile, 'utf8')),
  );
  writeFileSync(out, JSON.stringify(merged, null, 2));
  console.log(`${merged.length} eventos em ${out}`);
}
