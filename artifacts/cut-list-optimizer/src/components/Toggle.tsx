interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer"
        style={{ backgroundColor: checked ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked); } }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
          style={{ left: checked ? '17px' : '2px' }}
        />
      </div>
      {label && <span className="text-sm text-foreground">{label}</span>}
    </label>
  );
}
