import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}

export function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="text-2xl font-semibold leading-none tabular-nums">{value}</span>
          <span className="text-sm text-muted-foreground">{label}</span>
          {hint ? (
            <span className="mt-0.5 text-xs text-muted-foreground/70">{hint}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
