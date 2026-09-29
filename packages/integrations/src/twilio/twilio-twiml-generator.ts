import { TwiMLGenerationError } from '@voice-agent/errors';

export interface ConversationRelayParameter {
  readonly name: string;
  readonly value: string;
}

export interface GenerateConversationRelayTwiMLOptions {
  readonly websocketUrl: string;
  readonly parameters?: ReadonlyArray<ConversationRelayParameter> | undefined;
  readonly connectActionUrl?: string | undefined;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateConversationRelayTwiML(
  options: GenerateConversationRelayTwiMLOptions,
): string {
  const { websocketUrl, parameters, connectActionUrl } = options;

  if (!websocketUrl || (!websocketUrl.startsWith('wss://') && !websocketUrl.startsWith('ws://'))) {
    throw new TwiMLGenerationError(
      `ConversationRelay requires a valid WebSocket URL (wss:// or ws://), received: '${websocketUrl}'`,
    );
  }

  const escapedWsUrl = escapeXml(websocketUrl);
  const connectActionAttr = connectActionUrl ? ` action="${escapeXml(connectActionUrl)}"` : '';

  let paramsXml = '';
  if (parameters && parameters.length > 0) {
    const paramLines = parameters.map(
      (p) => `      <Parameter name="${escapeXml(p.name)}" value="${escapeXml(p.value)}" />`,
    );
    paramsXml = `\n${paramLines.join('\n')}\n    `;
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Response>\n` +
    `  <Connect${connectActionAttr}>\n` +
    `    <ConversationRelay url="${escapedWsUrl}">${paramsXml}</ConversationRelay>\n` +
    `  </Connect>\n` +
    `</Response>`
  );
}
