import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, string> = {
  active: "bg-success/10 text-success border-success/20",
  completed: "bg-primary/10 text-primary border-primary/20",
  delayed: "bg-destructive/10 text-destructive border-destructive/20",
  "on-hold": "bg-warning/10 text-warning border-warning/20",
  draft: "bg-muted text-muted-foreground border-border",
  pending: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-success/10 text-success border-success/20",
  issued: "bg-primary/10 text-primary border-primary/20",
  delivered: "bg-info/10 text-info border-info/20",
  closed: "bg-muted text-muted-foreground border-border",
  received: "bg-info/10 text-info border-info/20",
  "pending-review": "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  submitted: "bg-primary/10 text-primary border-primary/20",
  certified: "bg-success/10 text-success border-success/20",
  paid: "bg-success/10 text-success border-success/20",
  sufficient: "bg-success/10 text-success border-success/20",
  low: "bg-warning/10 text-warning border-warning/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  out: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize", statusStyles[status] || "bg-muted text-muted-foreground", className)}>
      {label}
    </span>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export function MetricCard({ title, value, subtitle, icon, trend, className }: MetricCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-heading font-bold text-card-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={cn("text-xs font-medium", trend.positive ? "text-success" : "text-destructive")}>
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
    </div>
  );
}

interface StockBarProps {
  level: number;
  className?: string;
}

export function StockBar({ level, className }: StockBarProps) {
  const color = level > 60 ? "bg-success" : level > 30 ? "bg-warning" : "bg-destructive";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 rounded-full bg-secondary">
        <div className={cn("h-2 rounded-full transition-all", color)} style={{ width: `${level}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-8 text-right">{level}%</span>
    </div>
  );
}
