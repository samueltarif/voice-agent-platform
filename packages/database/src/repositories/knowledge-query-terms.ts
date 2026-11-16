/**
 * A extração de termos é pura e vive em `@voice-agent/contracts` (fonte única,
 * usada também pela ferramenta `knowledge.search` em `apps/voice`). Reexportada
 * aqui para preservar os imports existentes do pacote de banco.
 */
export {
  extractKnowledgeQueryTerms,
  foldKnowledgeText,
  KNOWLEDGE_ACCENTED_CHARS,
  KNOWLEDGE_MAX_QUERY_TERMS,
  KNOWLEDGE_PLAIN_CHARS,
  stemKnowledgeTerm,
} from '@voice-agent/contracts';
