import type {
  CallSession,
  ConversationTextChunk,
  ModelStreamEvent,
  VoiceTransportPort,
} from '@voice-agent/contracts';
import { ConversationModelError } from '@voice-agent/errors';
import type { Logger } from '@voice-agent/logger';
import { extractModelTextDelta } from './extract-model-text-delta.js';

export interface ProcessModelStreamParams {
  readonly session: CallSession;
  readonly turnId: string;
  readonly generationId: string;
  readonly stream: AsyncIterable<ConversationTextChunk | ModelStreamEvent>;
  readonly transport: VoiceTransportPort;
  readonly logger: Logger;
  readonly isGenerationActive: (callId: string, genId: string) => boolean;
  readonly startTime: number;
}

export async function processModelStream(params: ProcessModelStreamParams): Promise<string> {
  const {
    session,
    turnId,
    generationId,
    stream,
    transport,
    logger,
    isGenerationActive,
    startTime,
  } = params;
  let fullResponse = '';
  let isFirst = true;

  for await (const item of stream) {
    if (!isGenerationActive(session.callId, generationId)) {
      logger.info('Discarding stale chunk due to barge-in', {
        callId: session.callId,
        organizationId: session.organizationId,
        turnId,
        generationId,
      });
      break;
    }

    if ('type' in item) {
      if (item.type === 'failure') throw new ConversationModelError(item.error);
      if (item.type === 'completed') break;
      if (item.type === 'usage') continue;
    }

    const delta = extractModelTextDelta(item);
    if (!delta) continue;

    if (isFirst) {
      isFirst = false;
      logger.info('model.stream.first_chunk', {
        callId: session.callId,
        organizationId: session.organizationId,
        turnId,
        generationId,
        durationMs: Date.now() - startTime,
      });
    }

    fullResponse += delta.text;
    await transport.speak(session.callId, {
      text: delta.text,
      generationId,
      isFinal: delta.isFinal,
    });
  }

  return fullResponse;
}
