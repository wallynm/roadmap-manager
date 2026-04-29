import type { ReactNode } from "react";

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3 border-b border-border last:border-0">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      {children}
    </div>
  );
}

export function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
