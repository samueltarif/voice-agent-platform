import { notFound } from 'next/navigation';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Progress,
  Skeleton,
} from '@voice-agent/ui';
import { TenantShell } from '../../shell/tenant-shell';

export default function UiPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <TenantShell title="Design System Preview (Dev Only)">
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold">Catálogo de Primitives do Design System</h2>
          <p className="text-xs text-muted-foreground">
            Rota restrita a desenvolvimento para validação visual dos componentes.
          </p>
        </div>

        {/* Buttons */}
        <Card className="p-4 space-y-3">
          <CardHeader className="p-0">
            <CardTitle className="text-sm">Buttons (Variantes &amp; Tamanhos)</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex flex-wrap gap-2 pt-2">
            <Button variant="default" size="sm">
              Default SM
            </Button>
            <Button variant="secondary" size="sm">
              Secondary
            </Button>
            <Button variant="outline" size="sm">
              Outline
            </Button>
            <Button variant="ghost" size="sm">
              Ghost
            </Button>
            <Button variant="destructive" size="sm">
              Destructive
            </Button>
          </CardContent>
        </Card>

        {/* Badges */}
        <Card className="p-4 space-y-3">
          <CardHeader className="p-0">
            <CardTitle className="text-sm">Badges Semânticos</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex flex-wrap gap-2 pt-2">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="success">Qualificado</Badge>
            <Badge variant="warning">Retorno</Badge>
            <Badge variant="danger">Sem interesse</Badge>
            <Badge variant="handoff">Handoff</Badge>
            <Badge variant="outline">Outline</Badge>
          </CardContent>
        </Card>

        {/* Inputs & Avatars & Progress */}
        <Card className="p-4 space-y-4">
          <CardHeader className="p-0">
            <CardTitle className="text-sm">Inputs, Progress &amp; Avatars</CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-4 pt-2">
            <div className="max-w-xs">
              <Input placeholder="Input de texto padrão..." />
            </div>
            <Progress value={65} className="max-w-md h-2" />
            <div className="flex gap-2 items-center">
              <Avatar className="h-8 w-8">
                <AvatarFallback>OP</AvatarFallback>
              </Avatar>
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      </div>
    </TenantShell>
  );
}
