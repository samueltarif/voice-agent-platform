import { describe, it, expect } from 'vitest';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import {
  availableKnowledgeActions,
  hasAnyKnowledgeAction,
  knowledgeAgentLabel,
  knowledgeManagePermissions,
} from './knowledge-document-actions';
import { KNOWLEDGE_TEST_DOC } from './knowledge-test-fixtures';

const AGENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const VERSION = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee';
const doc = (patch: Partial<KnowledgeDocumentResponse>) => ({ ...KNOWLEDGE_TEST_DOC, ...patch });
const admin = knowledgeManagePermissions('ADMIN');

describe('knowledge management permissions (UX mirror of the API RBAC)', () => {
  it('maps every role exactly', () => {
    expect(knowledgeManagePermissions('OWNER')).toEqual(admin);
    expect(admin).toEqual({
      edit: true,
      associate: true,
      archive: true,
      restore: true,
      delete: true,
    });
    expect(knowledgeManagePermissions('MANAGER')).toEqual({
      edit: true,
      associate: false,
      archive: false,
      restore: false,
      delete: false,
    });
    for (const role of ['OPERATOR', 'VIEWER', '', null, undefined]) {
      expect(hasAnyKnowledgeAction(knowledgeManagePermissions(role))).toBe(false);
    }
  });
});

describe('availableKnowledgeActions', () => {
  it('offers edit, associate and archive for a ready, unpinned document', () => {
    expect(availableKnowledgeActions(doc({ status: 'READY' }), admin)).toEqual([
      'edit',
      'associate',
      'archive',
    ]);
  });

  it('only allows archiving a document pinned to an agent version', () => {
    const pinned = doc({ agentId: AGENT, agentVersionId: VERSION });
    expect(availableKnowledgeActions(pinned, admin)).toEqual(['archive']);
  });

  it('offers restore and delete for an archived, unassociated document', () => {
    expect(availableKnowledgeActions(doc({ status: 'ARCHIVED' }), admin)).toEqual([
      'restore',
      'delete',
    ]);
  });

  it('never offers delete while the archived document is associated', () => {
    const linked = doc({ status: 'ARCHIVED', agentId: AGENT });
    expect(availableKnowledgeActions(linked, admin)).toEqual(['restore']);
  });

  it('limits MANAGER to editing and failed documents to archiving', () => {
    const manager = knowledgeManagePermissions('MANAGER');
    expect(availableKnowledgeActions(doc({}), manager)).toEqual(['edit']);
    expect(availableKnowledgeActions(doc({ status: 'ARCHIVED' }), manager)).toEqual([]);
    expect(availableKnowledgeActions(doc({ status: 'FAILED' }), admin)).toEqual(['archive']);
  });
});

describe('knowledgeAgentLabel', () => {
  it('states that a document without agent is available to every agent', () => {
    expect(knowledgeAgentLabel({ agentId: null }, new Map())).toBe('Todos os agentes');
  });

  it('shows the agent name, falls back to a short id and flags pinned versions', () => {
    const names = new Map([[AGENT, 'Atendente Qualitec']]);
    expect(knowledgeAgentLabel({ agentId: AGENT }, names)).toBe('Atendente Qualitec');
    expect(knowledgeAgentLabel({ agentId: AGENT }, new Map())).toBe('aaaaaaaa…');
    expect(knowledgeAgentLabel({ agentId: AGENT, agentVersionId: VERSION }, names)).toBe(
      'Atendente Qualitec · versão fixada',
    );
  });
});
