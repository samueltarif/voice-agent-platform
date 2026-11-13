/**
 * Execução de ferramentas SEM transporte de voz (DEC-061): motor com
 * autorizador obrigatório, registro, ferramenta `knowledge.search` e o turno
 * simulado de conhecimento. Compartilhado por `apps/voice` (concessão da
 * chamada) e `apps/api` (simulador do Agent Studio). Sem banco, sem provedor.
 */
export * from './build-safe-log-context.js';
export * from './tool-authorization.js';
export * from './tool-execution-engine.js';
export * from './tool-registry.js';
export * from './voice-knowledge-scope.js';
export * from './knowledge-search-tool.js';
export * from './knowledge-turn.js';
