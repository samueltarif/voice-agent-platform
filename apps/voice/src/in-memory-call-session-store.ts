import type { CallSession, CallSessionStorePort } from '@voice-agent/contracts';

export class InMemoryCallSessionStore implements CallSessionStorePort {
  private readonly sessions = new Map<string, CallSession>();

  private buildKey(organizationId: string, callId: string): string {
    return `${organizationId}:${callId}`;
  }

  async getById(organizationId: string, callId: string): Promise<CallSession | null> {
    const key = this.buildKey(organizationId, callId);
    const session = this.sessions.get(key);
    return session ? { ...session } : null;
  }

  async save(session: CallSession): Promise<void> {
    const key = this.buildKey(session.organizationId, session.callId);
    this.sessions.set(key, { ...session });
  }

  clear(): void {
    this.sessions.clear();
  }

  get size(): number {
    return this.sessions.size;
  }
}
