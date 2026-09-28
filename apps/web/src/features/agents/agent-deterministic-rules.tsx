import * as React from 'react';
import { Input } from '@voice-agent/ui';
import type { AgentRulesV1 } from '@voice-agent/contracts';

interface DeterministicRulesFieldsProps {
  readonly deterministic: AgentRulesV1['deterministic'];
  readonly disabled?: boolean | undefined;
  readonly onUpdateMaxDiscount: (value: string) => void;
  readonly onUpdateOperatingHours: (value: string) => void;
}

export function DeterministicRulesFields({
  deterministic,
  disabled,
  onUpdateMaxDiscount,
  onUpdateOperatingHours,
}: DeterministicRulesFieldsProps) {
  return (
    <div className="pt-3 border-t border-border/40 space-y-3">
      <span className="text-xs font-semibold text-foreground">Limites Determinísticos</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="rules-max-discount" className="text-xs font-medium text-foreground">
            Desconto Máximo (%)
          </label>
          <Input
            id="rules-max-discount"
            data-testid="input-max-discount"
            type="number"
            min={0}
            max={100}
            value={deterministic.maxDiscountPercent ?? ''}
            disabled={disabled}
            onChange={(e) => onUpdateMaxDiscount(e.target.value)}
            placeholder="Ex: 10"
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="rules-operating-hours" className="text-xs font-medium text-foreground">
            Horário de Atendimento
          </label>
          <Input
            id="rules-operating-hours"
            data-testid="input-operating-hours"
            value={deterministic.operatingHours ?? ''}
            disabled={disabled}
            onChange={(e) => onUpdateOperatingHours(e.target.value)}
            placeholder="Ex: Seg-Sex das 09h às 18h"
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
