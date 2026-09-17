'use client';

import { Zap, TrendingUp } from 'lucide-react';
import { Localize } from '@deriv-com/translations';
import { cn } from '@/lib/utils';

interface AutomationSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}

/**
 * Accessible on/off switch built from a plain button — the template has no
 * dedicated Switch primitive, so this keeps the automation panel dependency
 * free while still exposing role="switch" for screen readers.
 */
function AutomationSwitch({ checked, onCheckedChange, label }: AutomationSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}

export interface AutomationControlsProps {
  /** When on, tapping a digit places the entry immediately. */
  autoEntry: boolean;
  onAutoEntryChange: (value: boolean) => void;
  /** When on, a winning return is reinvested into the next stake. */
  sorosEnabled: boolean;
  onSorosChange: (value: boolean) => void;
  /** Current Soros streak level (0 = base stake). */
  sorosLevel: number;
}

export function AutomationControls({
  autoEntry,
  onAutoEntryChange,
  sorosEnabled,
  onSorosChange,
  sorosLevel,
}: AutomationControlsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Zap className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">
              <Localize i18n_default_text="Auto entry" />
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              <Localize i18n_default_text="Tap a digit to enter instantly" />
            </p>
          </div>
        </div>
        <AutomationSwitch
          checked={autoEntry}
          onCheckedChange={onAutoEntryChange}
          label="Auto entry"
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium leading-tight">
                <Localize i18n_default_text="Soros" />
              </p>
              {sorosEnabled && sorosLevel > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                  <Localize
                    i18n_default_text="Level {{level}}"
                    values={{ level: sorosLevel }}
                  />
                </span>
              )}
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground">
              <Localize i18n_default_text="Reinvest the previous win into the next entry" />
            </p>
          </div>
        </div>
        <AutomationSwitch
          checked={sorosEnabled}
          onCheckedChange={onSorosChange}
          label="Soros"
        />
      </div>
    </div>
  );
}
