# CLAUDE.md — Voice Agent Platform

As regras operacionais obrigatórias deste repositório estão em [`AGENTS.md`](AGENTS.md) e [`docs/AI_EXECUTION_RULES.md`](docs/AI_EXECUTION_RULES.md). Elas continuam valendo integralmente; este arquivo **acrescenta** regras e não as substitui. Em caso de conflito, prevalece a regra mais restritiva.

## Contexto e status obrigatório do Voice Agent Platform

**No início de cada tarefa**, ler obrigatoriamente, nesta ordem:
1. [`AGENTS.md`](AGENTS.md);
2. [`docs/AI_EXECUTION_RULES.md`](docs/AI_EXECUTION_RULES.md);
3. [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md).

O `docs/PROJECT_STATUS.md` é o documento vivo do projeto e contém:
- o que já foi integrado e testado;
- o que está autorizado ou em andamento;
- o backlog e as decisões;
- os bloqueios para produção;
- o critério de conclusão do MVP.

Quando relevante, ler também `docs/ROADMAP_KNOWLEDGE.md`, `docs/DECISIONS_LOG.md`, `docs/AI_WORKLOG.md` e `docs/SECURITY.md`. Antes de afirmar qualquer status em tempo real, verificar `git fetch origin`, `git status`, o HEAD da `origin/main` e as PRs atuais.

### Perguntas sobre andamento

Perguntas como “o que já fizemos?”, “o que falta para concluir o SaaS?” e “qual a próxima etapa?” exigem duas coisas:
1. Consultar **primeiro** `docs/PROJECT_STATUS.md` e conferir no Git.
2. Responder nesta estrutura, indicando a data da última conferência:
   - **Integrado e testado**
   - **Em andamento ou autorizado**
   - **Planejado**
   - **Bloqueios**
   - **Próximo passo**

**Nunca tratar um plano como PR concluída, nem um gate verde como prova de produto pronto.**

**Quando Git ou GitHub não puderem ser consultados**, identificar o status como **NÃO VERIFICADO**. Informar a data do último registro em `docs/PROJECT_STATUS.md`, sem apresentar informações antigas como atuais.

### Manutenção do status

Após cada PR integrada e verificada, **atualizar `docs/PROJECT_STATUS.md`** com:
- PR, SHA do head, SHA do merge e conferência de árvore;
- resultados dos gates;
- decisões novas;
- pendências e próximo passo;
- data da verificação.

O procedimento completo está em `docs/PROJECT_STATUS.md` §10. Não editar o histórico de decisões sem sinalizar o motivo. Preferir PR documental para essas atualizações.

## Proibições permanentes

- Proteger o **banco original da Qualitec**, o **banco de homologação** (`voice_agent_pr157_test`) e o **agente Qualitec v4 publicado**. Não alterá-los nem republicá-los.
- Não executar migrations em bancos existentes, não fazer chamadas pagas (IA, telefonia) e não fazer merge sem aprovação expressa do operador.
- **Integrações empresariais agora são somente leitura.** Criar pedidos, agendar serviços, atualizar CRM e abrir chamados **somente após testes reais de ligações e autorização expressa**.
- Os requisitos de isolamento de rede, limites de recursos, auditoria e quotas (`docs/SECURITY.md` §11) **continuam bloqueando** o upload público de arquivos.
