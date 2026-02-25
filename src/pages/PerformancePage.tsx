import { TrendingUp, TrendingDown, Minus, Brain, Users, Award, AlertCircle } from "lucide-react";
import { teamMembers, formatCurrency } from "@/data/sampleData";
import { cn } from "@/lib/utils";

export default function PerformancePage() {
  const departments = ["Operations", "Finance", "Sales"] as const;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-destructive";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-success";
    if (score >= 60) return "bg-warning";
    return "bg-destructive";
  };

  const topPerformers = [...teamMembers].sort((a, b) => b.score - a.score).slice(0, 3);
  const needsAttention = [...teamMembers].filter((m) => m.score < 75);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Performance Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">STRIKE — Team & Workflow Analytics</p>
      </div>

      {/* Department score cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {departments.map((dept) => {
          const members = teamMembers.filter((m) => m.department === dept);
          const avgScore = Math.round(members.reduce((s, m) => s + m.score, 0) / members.length);
          return (
            <div key={dept} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-heading font-semibold text-card-foreground">{dept}</h3>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-end gap-3">
                <span className={cn("text-4xl font-heading font-bold", getScoreColor(avgScore))}>{avgScore}</span>
                <span className="text-xs text-muted-foreground mb-1">/ 100</span>
              </div>
              <div className="h-2 rounded-full bg-secondary mt-3">
                <div className={cn("h-2 rounded-full transition-all", getScoreBg(avgScore))} style={{ width: `${avgScore}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{members.length} team members</p>
            </div>
          );
        })}
      </div>

      {/* Team members grid */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-5 border-b border-border">
          <h2 className="text-base font-heading font-semibold text-card-foreground">Individual Performance</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
          {teamMembers.map((m) => (
            <div key={m.id} className="rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-card-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                </div>
                <div className={cn("flex items-center gap-1 text-xs font-medium", m.trend === "up" ? "text-success" : m.trend === "down" ? "text-destructive" : "text-muted-foreground")}>
                  {m.trend === "up" ? <TrendingUp className="h-3 w-3" /> : m.trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {m.trend}
                </div>
              </div>

              {/* Score ring */}
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 shrink-0">
                  <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={m.score >= 80 ? "hsl(160, 84%, 39%)" : m.score >= 60 ? "hsl(45, 93%, 47%)" : "hsl(0, 84%, 60%)"} strokeWidth="3" strokeDasharray={`${m.score}, 100`} strokeLinecap="round" />
                  </svg>
                  <span className={cn("absolute inset-0 flex items-center justify-center text-sm font-bold", getScoreColor(m.score))}>{m.score}</span>
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tasks</span>
                    <span className="font-medium text-card-foreground">{m.tasksCompleted}/{m.tasksTotal}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(m.tasksCompleted / m.tasksTotal) * 100}%` }} />
                  </div>
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", m.department === "Operations" ? "bg-primary/10 text-primary" : m.department === "Finance" ? "bg-success/10 text-success" : "bg-accent/10 text-accent")}>{m.department}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card shadow-sm p-5">
          <h3 className="text-sm font-heading font-semibold text-card-foreground flex items-center gap-2 mb-4">
            <Award className="h-4 w-4 text-success" /> Top Performers
          </h3>
          <div className="space-y-3">
            {topPerformers.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/10 text-success text-xs font-bold">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-card-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                </div>
                <span className="text-sm font-bold text-success">{m.score}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm p-5">
          <h3 className="text-sm font-heading font-semibold text-card-foreground flex items-center gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-warning" /> Needs Attention
          </h3>
          <div className="space-y-3">
            {needsAttention.length > 0 ? needsAttention.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <div className={cn("h-2 w-2 rounded-full shrink-0", m.score < 70 ? "bg-destructive" : "bg-warning")} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-card-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role} — {m.tasksCompleted}/{m.tasksTotal} tasks completed</p>
                </div>
                <span className={cn("text-sm font-bold", getScoreColor(m.score))}>{m.score}</span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">All team members performing well 🎉</p>
            )}
          </div>
        </div>

        {/* AI Insights */}
        <div className="md:col-span-2 rounded-xl border border-primary/20 bg-primary/5 p-5">
          <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-primary" /> AI Recommendations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Procurement Bottleneck", desc: "PO approval cycle averaging 4.2 days — consider auto-approval for orders under SGD 10,000 to improve flow." },
              { title: "Resource Reallocation", desc: "Project P-003 (Woodlands MRT) shows 38% progress with 50% budget consumed — review material wastage." },
              { title: "Team Capacity", desc: "Operations team at 85% capacity — consider redistributing QA tasks to reduce bottlenecks on David Lim." },
            ].map((insight, i) => (
              <div key={i} className="rounded-lg border border-primary/10 bg-card p-4">
                <p className="text-sm font-medium text-card-foreground mb-1">{insight.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{insight.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
