import { useState } from "react";
import {
  BarChart3, Package, FileText, AlertTriangle, TrendingUp, DollarSign, Briefcase, Clock, MoreHorizontal, Filter
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { MetricCard, StatusBadge } from "@/components/shared/UIComponents";
import { projects, alerts, claimsData, formatCurrency } from "@/data/sampleData";
import { cn } from "@/lib/utils";

type ProjectFilter = "all" | "active" | "completed" | "delayed";

export default function DashboardPage() {
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const filtered = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  const activeCount = projects.filter((p) => p.status === "active").length;
  const totalExposure = 163500;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Welcome back, John</h1>
        <p className="text-sm text-muted-foreground mt-1">Tuesday, 25 February 2025 · Operations Overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Active Projects" value={activeCount} icon={<Briefcase className="h-5 w-5" />} trend={{ value: "2 new this month", positive: true }} />
        <MetricCard title="Pending Claims" value={formatCurrency(480000)} subtitle="Feb 2025" icon={<DollarSign className="h-5 w-5" />} trend={{ value: "12% vs last month", positive: true }} />
        <MetricCard title="Outstanding Invoices" value="3" subtitle="Total: SGD 206,200" icon={<FileText className="h-5 w-5" />} />
        <MetricCard title="Inventory Exposure" value={formatCurrency(totalExposure)} subtitle="2 critical items" icon={<Package className="h-5 w-5" />} trend={{ value: "Needs attention", positive: false }} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Project table - 2 cols */}
        <div className="xl:col-span-2 rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-border">
            <h2 className="text-base font-heading font-semibold text-card-foreground">Project Overview</h2>
            <div className="flex gap-1.5">
              {(["all", "active", "completed", "delayed"] as ProjectFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  )}
                >
                  {f === "all" ? "All Projects" : f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-4 font-medium">Project</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Progress</th>
                  <th className="text-left p-4 font-medium">Budget vs Actual</th>
                  <th className="text-center p-4 font-medium">Materials</th>
                  <th className="text-left p-4 font-medium">Claims</th>
                  <th className="text-center p-4 font-medium">Alerts</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                    <td className="p-4">
                      <p className="font-medium text-card-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.id}</p>
                    </td>
                    <td className="p-4"><StatusBadge status={p.status} /></td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-secondary">
                          <div className={cn("h-2 rounded-full", p.progress >= 80 ? "bg-success" : p.progress >= 50 ? "bg-primary" : "bg-warning")} style={{ width: `${p.progress}%` }} />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-xs text-muted-foreground">{formatCurrency(p.actual)} / {formatCurrency(p.budget)}</p>
                      <div className="h-1.5 w-24 rounded-full bg-secondary mt-1">
                        <div className={cn("h-1.5 rounded-full", (p.actual / p.budget) > 0.9 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min((p.actual / p.budget) * 100, 100)}%` }} />
                      </div>
                    </td>
                    <td className="p-4 text-center font-medium text-card-foreground">{p.materialsAllocated}</td>
                    <td className="p-4"><StatusBadge status={p.claimsStatus} /></td>
                    <td className="p-4 text-center">
                      {p.alerts > 0 ? (
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-destructive/10 text-destructive text-xs font-bold">{p.alerts}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alerts sidebar */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="text-base font-heading font-semibold text-card-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Alerts
            </h2>
            <span className="text-xs font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">{alerts.length}</span>
          </div>
          <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {alerts.map((a) => (
              <div key={a.id} className="p-4 hover:bg-secondary/40 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 h-2 w-2 rounded-full shrink-0",
                    a.severity === "high" ? "bg-destructive" : a.severity === "medium" ? "bg-warning" : "bg-info"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.description}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">{a.timestamp}</span>
                      <button className="text-[10px] font-medium text-primary hover:underline">View</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Claims Chart */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-heading font-semibold text-card-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Claims Tracker
          </h2>
          <span className="text-xs text-muted-foreground">Last 6 months</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={claimsData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 9%, 46%)" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 9%, 46%)" tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, border: "1px solid hsl(220, 13%, 91%)", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="submitted" name="Submitted" fill="hsl(217, 91%, 53%)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="certified" name="Certified" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="paid" name="Paid" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
