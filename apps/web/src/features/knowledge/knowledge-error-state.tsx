import * as React from 'react';
import {
  AlertCircle,
  FileQuestion,
  Lock,
  LogIn,
  ServerCrash,
  WifiOff,
  ShieldAlert,
} from 'lucide-react';
import { Button, Card, CardContent } from '@voice-agent/ui';

export type KnowledgeErrorKind =
  | 'connection'
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'internal'
  | 'no-permission';

export function kindFromStatus(status: number | undefined): KnowledgeErrorKind {
  switch (status) {
    case 400:
      return 'validation';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 404:
      return 'not-found';
    case 409:
      return 'conflict';
    case undefined:
    case 0:
      return 'connection';
    default:
      return 'internal';
  }
}

interface ErrorCopy {
  readonly icon: React.ElementType;
  readonly title: string;
  readonly text: string;
  readonly retry?: boolean;
  readonly login?: boolean;
}

// Copy fixa e segura: nunca repassa mensagem técnica do servidor.
const COPY: Record<KnowledgeErrorKind, ErrorCopy> = {
  connection: {
    icon: WifiOff,
    title: 'Sem conexão',
    text: 'Não foi possível falar com o servidor. Verifique sua internet e tente novamente.',
    retry: true,
  },
  validation: {
    icon: AlertCircle,
    title: 'Dados inválidos',
    text: 'Revise os campos destacados e tente novamente.',
  },
  unauthenticated: {
    icon: LogIn,
    title: 'Sessão expirada',
    text: 'Entre novamente para continuar.',
    login: true,
  },
  forbidden: {
    icon: ShieldAlert,
    title: 'Permissão insuficiente',
    text: 'Seu perfil não permite esta ação. Fale com um administrador da organização.',
  },
  'not-found': {
    icon: FileQuestion,
    title: 'Documento não encontrado',
    text: 'Ele pode ter sido removido ou você não tem acesso. Atualize a lista.',
    retry: true,
  },
  conflict: {
    icon: AlertCircle,
    title: 'Documento em conflito',
    text: 'Já existe um documento com origem ou conteúdo equivalente. Revise antes de cadastrar novamente.',
  },
  internal: {
    icon: ServerCrash,
    title: 'Algo deu errado',
    text: 'Ocorreu um erro inesperado. Tente novamente em instantes.',
    retry: true,
  },
  'no-permission': {
    icon: Lock,
    title: 'Acesso restrito',
    text: 'Seu perfil não tem acesso à Base de Conhecimento. Fale com um administrador.',
  },
};

interface Props {
  readonly kind: KnowledgeErrorKind;
  readonly onRetry?: () => void;
  readonly loginHref?: string;
  readonly compact?: boolean;
}

export function KnowledgeErrorState({ kind, onRetry, loginHref = '/login', compact }: Props) {
  const c = COPY[kind];
  const Icon = c.icon;
  return (
    <Card
      className="border-border/60 shadow-xs"
      role={kind === 'no-permission' ? undefined : 'alert'}
      data-testid={`kb-error-${kind}`}
    >
      <CardContent
        className={`flex flex-col items-center text-center px-4 ${compact ? 'py-8' : 'py-16'}`}
      >
        <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">{c.title}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mb-6">{c.text}</p>
        {c.retry && onRetry && (
          <Button size="sm" variant="outline" className="min-h-[44px] text-xs" onClick={onRetry}>
            Tentar novamente
          </Button>
        )}
        {c.login && (
          <Button asChild size="sm" className="min-h-[44px] text-xs">
            <a href={loginHref}>Entrar novamente</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
