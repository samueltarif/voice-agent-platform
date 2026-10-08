import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@voice-agent/ui';
import type { CanonicalToolName } from '@voice-agent/contracts';

interface AgentToolsSectionProps {
  readonly tools?: readonly CanonicalToolName[] | undefined;
  readonly onChange: (tools: CanonicalToolName[]) => void;
  readonly disabled?: boolean | undefined;
}

interface CanonicalToolItem {
  readonly name: CanonicalToolName;
  readonly label: string;
  readonly description: string;
}

const AVAILABLE_CANONICAL_TOOLS: readonly CanonicalToolItem[] = [
  {
    name: 'agent.operating_hours',
    label: 'Consulta de Horários de Atendimento',
    description:
      'Permite ao agente consultar e responder os horários de atendimento de forma determinística.',
  },
];

interface ToolItemRowProps {
  readonly tool: CanonicalToolItem;
  readonly isConfigured: boolean;
  readonly disabled: boolean;
  readonly onToggle: (toolName: CanonicalToolName, isEnabled: boolean) => void;
}

function ToolItemRow({ tool, isConfigured, disabled, onToggle }: ToolItemRowProps) {
  const inputId = `tool-checkbox-${tool.name}`;
  return (
    <div
      className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border/60 bg-card hover:bg-muted/30 transition-colors"
      data-testid={`tool-item-${tool.name}`}
    >
      <div className="space-y-1 flex-1">
        <div className="flex items-center gap-2">
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-foreground cursor-pointer select-none"
          >
            {tool.label}
          </label>
          <code className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {tool.name}
          </code>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <input
          id={inputId}
          type="checkbox"
          data-testid={`toggle-tool-${tool.name}`}
          checked={isConfigured}
          disabled={disabled}
          onChange={(e) => onToggle(tool.name, e.target.checked)}
          className="h-4 w-4 rounded border-input text-primary focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          aria-label={`Habilitar ferramenta ${tool.label}`}
        />
      </div>
    </div>
  );
}

export function AgentToolsSection({
  tools = [],
  onChange,
  disabled = false,
}: AgentToolsSectionProps) {
  const currentTools = Array.isArray(tools) ? tools : [];

  const handleToggle = (toolName: CanonicalToolName, isEnabled: boolean) => {
    if (isEnabled) {
      if (!currentTools.includes(toolName)) {
        onChange([...currentTools, toolName]);
      }
    } else {
      onChange(currentTools.filter((t) => t !== toolName));
    }
  };

  const enabledCount = currentTools.length;

  return (
    <Card className="border-border/70 shadow-xs" data-testid="agent-tools-section">
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Ferramentas do Agente (Tools)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ferramentas canônicas autorizadas para execução durante os atendimentos.
            </p>
          </div>
          <Badge variant="outline" className="text-xs" data-testid="tools-count-badge">
            {enabledCount === 1 ? '1 ativa' : `${enabledCount} ativas`}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {AVAILABLE_CANONICAL_TOOLS.map((tool) => (
          <ToolItemRow
            key={tool.name}
            tool={tool}
            isConfigured={currentTools.includes(tool.name)}
            disabled={disabled}
            onToggle={handleToggle}
          />
        ))}
      </CardContent>
    </Card>
  );
}
