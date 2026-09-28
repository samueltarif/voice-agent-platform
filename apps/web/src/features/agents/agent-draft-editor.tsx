'use client';

import * as React from 'react';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { useAgentDraftEditorState } from './use-agent-draft-editor-state';
import { AgentDraftEditorActions } from './agent-draft-editor-actions';
import { AgentPersonaSection } from './agent-persona-section';
import { AgentVoiceSection } from './agent-voice-section';
import { AgentRulesSection } from './agent-rules-section';
import { AgentPlaybookSection } from './agent-playbook-section';
import { AgentExamplesSection } from './agent-examples-section';

interface AgentDraftEditorProps {
  readonly agentId: string;
  readonly versionId: string;
  readonly initialConfiguration: AgentConfigurationSnapshotV1;
  readonly readOnly?: boolean;
}

export function AgentDraftEditor({
  agentId,
  versionId,
  initialConfiguration,
  readOnly = false,
}: AgentDraftEditorProps) {
  const {
    config,
    setConfig,
    isDirty,
    isSaving,
    isDiscarding,
    errorMessage,
    savedSuccess,
    handleSave,
    handleDiscard,
  } = useAgentDraftEditorState({ agentId, versionId, initialConfiguration });

  const isBusy = readOnly || isSaving || isDiscarding;

  return (
    <div className="space-y-6" data-testid="agent-draft-editor">
      <AgentDraftEditorActions
        isDirty={isDirty}
        readOnly={readOnly}
        isSaving={isSaving}
        isDiscarding={isDiscarding}
        errorMessage={errorMessage}
        savedSuccess={savedSuccess}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      <AgentPersonaSection
        persona={config.persona}
        onChange={(persona) => setConfig({ ...config, persona })}
        disabled={isBusy}
      />

      <AgentVoiceSection
        voice={config.voice}
        onChange={(voice) => setConfig({ ...config, voice })}
        disabled={isBusy}
      />

      <AgentRulesSection
        rules={config.rules}
        onChange={(rules) => setConfig({ ...config, rules })}
        disabled={isBusy}
      />

      <AgentPlaybookSection
        playbook={config.playbook}
        onChange={(playbook) => setConfig({ ...config, playbook })}
        disabled={isBusy}
      />

      <AgentExamplesSection
        examples={config.examples}
        onChange={(examples) => setConfig({ ...config, examples })}
        disabled={isBusy}
      />
    </div>
  );
}
