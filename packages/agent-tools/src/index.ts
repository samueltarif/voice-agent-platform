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
// B2a (DEC-071): ramo `v2` (só projeção sanitizada da B2b; bloqueado por padrão).
export * from './knowledge-v2-concurrency-limiter.js';
export * from './knowledge-search-tool-v2.js';
export * from './knowledge-turn-v2.js';
// B2c (DEC-072): compositor determinístico da fala (só caminho v2 simulado).
export * from './knowledge-voice-reply.js';
export * from './knowledge-voice-reply-render.js';
export * from './knowledge-voice-reply-verification.js';
export * from './knowledge-voice-vocabulary.js';
