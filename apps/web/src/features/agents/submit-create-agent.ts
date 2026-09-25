import type { useRouter } from 'next/navigation';
import type { CreateAgentHttpBody } from '@voice-agent/contracts';

export async function submitCreateAgent(
  payload: CreateAgentHttpBody,
  orgSlug: string,
  router: ReturnType<typeof useRouter>,
): Promise<string | null> {
  try {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return data?.error ?? 'Falha ao criar o agente. Tente novamente.';
    }

    router.push(`/orgs/${orgSlug}/agents`);
    router.refresh();
    return null;
  } catch {
    return 'Erro de conexão ao criar agente.';
  }
}
