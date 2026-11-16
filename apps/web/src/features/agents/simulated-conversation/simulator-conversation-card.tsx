'use client';

import * as React from 'react';
import { SimulatorConversationView } from './simulator-conversation-view';
import { useSimulatedConversation } from './use-simulated-conversation';

export interface SimulatorConversationCardProps {
  readonly orgSlug: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly publishedVersionNumber: number;
}

/** Parte interativa do simulador: o restante da página continua montado no servidor. */
export function SimulatorConversationCard(props: SimulatorConversationCardProps) {
  const state = useSimulatedConversation({ orgSlug: props.orgSlug, agentId: props.agentId });
  return (
    <SimulatorConversationView
      state={state}
      agentName={props.agentName}
      publishedVersionNumber={props.publishedVersionNumber}
    />
  );
}
