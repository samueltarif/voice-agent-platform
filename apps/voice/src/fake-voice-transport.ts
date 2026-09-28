import type { VoiceTransportPort } from '@voice-agent/contracts';

export interface RecordedSpeakCall {
  readonly callId: string;
  readonly command: { text: string; generationId: string; isFinal: boolean };
}

export interface RecordedInterruptCall {
  readonly callId: string;
  readonly command?: { generationId?: string | undefined } | undefined;
}

export interface RecordedEndCall {
  readonly callId: string;
  readonly reason?: string | undefined;
}

export class FakeVoiceTransport implements VoiceTransportPort {
  readonly providerName = 'fake-transport';
  readonly speakCalls: RecordedSpeakCall[] = [];
  readonly interruptCalls: RecordedInterruptCall[] = [];
  readonly endCalls: RecordedEndCall[] = [];

  shouldFailOnSpeak = false;
  shouldFailOnInterrupt = false;

  async speak(
    callId: string,
    command: { text: string; generationId: string; isFinal: boolean },
  ): Promise<void> {
    if (this.shouldFailOnSpeak) {
      throw new Error('Fake transport speak failure');
    }
    this.speakCalls.push({ callId, command });
  }

  async interruptSpeech(callId: string, command?: { generationId?: string }): Promise<void> {
    if (this.shouldFailOnInterrupt) {
      throw new Error('Fake transport interrupt failure');
    }
    this.interruptCalls.push({ callId, command });
  }

  async endCall(callId: string, reason?: string): Promise<void> {
    this.endCalls.push({ callId, reason });
  }

  reset(): void {
    this.speakCalls.length = 0;
    this.interruptCalls.length = 0;
    this.endCalls.length = 0;
    this.shouldFailOnSpeak = false;
    this.shouldFailOnInterrupt = false;
  }
}
