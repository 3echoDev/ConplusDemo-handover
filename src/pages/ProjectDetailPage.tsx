import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Calendar, DollarSign, AlertCircle, TrendingUp, Package, CheckCircle2, Circle, Clock, Ban, AlertTriangle } from "lucide-react";
import { StatusBadge, StockBar } from "@/components/shared/UIComponents";
import { formatCurrency } from "@/data/sampleData";
import { useAppData } from "@/data/AppDataContext";
import { cn } from "@/lib/utils";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { projects, inventory, purchaseOrders, projectTasks, materialPrices, isLoading } = useAppData();

  const project = projects.find((p) => p.id === projectId || p.code === projectId);
  const matchesProject = (id: string, code: string) =>
    (project && (id === project.id || (code !== "" && code === project.code))) ?? false;

  // VO / phase grouping: the client's project list stores variation orders as
  // separate rows like "F22023 (VO)" — group them with their base project.
  const baseCode = (code: string) => code.split(" (")[0].trim();
  const family = project ? projects.filter((p) => baseCode(p.code) === baseCode(project.code)) : [];
  const voRows = family.filter((p) => p.id !== project?.id);
  const familyTotal = family.reduce((s, p) => s + p.budget, 0);

  const projectMaterials = inventory.filter((i) =>
    i.projectAllocations.some((a) => matchesProject(a.projectId, a.projectCode))
  );
  const projectPOs = purchaseOrders.filter((po) => matchesProject(po.projectId, po.projectCode));
  const tasks = projectTasks.filter((task) => matchesProject(task.projectId, task.projectCode));

  const taskStats = {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === "completed").length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };

  if (!project) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">{isLoading ? "Loading project..." : "Project not found."}</p>
          <button
            onClick={() => navigate("/projects")}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const budgetUsage = project.budget > 0 ? (project.actual / project.budget) * 100 : 0;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate("/projects")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{project.client} · {project.code}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {project.location}
              </div>
              <StatusBadge status={project.status} />
              <span className="text-xs text-muted-foreground">PM: {project.manager}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Progress</span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <p className="text-3xl font-heading font-bold text-card-foreground">{project.progress}%</p>
          <div className="h-2 rounded-full bg-secondary mt-3">
            <div
              className={cn(
                "h-2 rounded-full transition-all",
                project.progress >= 75 ? "bg-success" : project.progress >= 50 ? "bg-primary" : "bg-warning"
              )}
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Budget</span>
            <DollarSign className="h-4 w-4 text-success" />
          </div>
          <p className="text-2xl font-heading font-bold text-card-foreground">{formatCurrency(project.budget)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Spent: {formatCurrency(project.actual)} ({budgetUsage.toFixed(0)}%)
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Timeline</span>
            <Calendar className="h-4 w-4 text-accent" />
          </div>
          <p className="text-sm font-semibold text-card-foreground">{project.startDate}</p>
          <p className="text-sm font-semibold text-card-foreground">{project.endDate}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Materials</span>
            <Package className="h-4 w-4 text-primary" />
          </div>
          <p className="text-3xl font-heading font-bold text-card-foreground">{projectMaterials.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{project.alerts} alerts</p>
        </div>
      </div>

      {/* Variation Orders / Phases (from the client's project list) */}
      {voRows.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-heading font-semibold text-card-foreground">
              Variation Orders & Phases ({voRows.length})
            </h2>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Combined Contract Value</p>
              <p className="text-sm font-bold text-card-foreground">{formatCurrency(familyTotal)}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {voRows.map((vo) => (
              <div
                key={vo.id}
                onClick={() => navigate(`/projects/${vo.id}`)}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-secondary/40 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-foreground">{vo.code}</p>
                  <p className="text-xs text-muted-foreground truncate">{vo.name}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-card-foreground">{formatCurrency(vo.budget)}</span>
                  <StatusBadge status={vo.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts (if any) */}
      {project.alerts > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {project.alerts} active alert{project.alerts > 1 ? "s" : ""} for this project
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Review material stock levels and purchase orders
            </p>
          </div>
        </div>
      )}

      {/* Tasks Section */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-heading font-semibold text-card-foreground">
            Tasks & Work Items ({tasks.length})
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3 w-3" /> {taskStats.completed}
            </span>
            <span className="flex items-center gap-1 text-primary">
              <Clock className="h-3 w-3" /> {taskStats.inProgress}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Circle className="h-3 w-3" /> {taskStats.pending}
            </span>
            {taskStats.blocked > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <Ban className="h-3 w-3" /> {taskStats.blocked}
              </span>
            )}
          </div>
        </div>
        <div className="divide-y divide-border">
          {tasks.map((task) => {
            const statusConfig = {
              completed: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
              "in-progress": { icon: Clock, color: "text-primary", bg: "bg-primary/10" },
              pending: { icon: Circle, color: "text-muted-foreground", bg: "bg-secondary" },
              blocked: { icon: Ban, color: "text-destructive", bg: "bg-destructive/10" },
            };
            const config = statusConfig[task.status];
            const StatusIcon = config.icon;

            const priorityConfig = {
              high: "text-destructive",
              medium: "text-warning",
              low: "text-muted-foreground",
            };

            return (
              <div key={task.id} className="p-4 hover:bg-secondary/40 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", config.bg)}>
                    <StatusIcon className={cn("h-4 w-4", config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h3 className="text-sm font-medium text-card-foreground">{task.title}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn("text-xs font-medium uppercase", priorityConfig[task.priority])}>
                          {task.priority}
                        </span>
                        <span className="text-xs text-muted-foreground">{task.dueDate}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{task.description}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Assigned to: <span className="font-medium text-card-foreground">{task.assignedTo}</span></span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", config.bg, config.color)}>
                        {task.status.replace("-", " ")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {tasks.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No tasks created for this project yet
            </div>
          )}
        </div>
      </div>

      {/* Materials Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-5 border-b border-border">
          <h2 className="text-base font-heading font-semibold text-card-foreground">
            Allocated Materials ({projectMaterials.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left p-4 font-medium">Material</th>
                <th className="text-left p-4 font-medium">Category</th>
                <th className="text-right p-4 font-medium">Allocated Qty</th>
                <th className="text-left p-4 font-medium">Unit</th>
                <th className="text-right p-4 font-medium">Value</th>
                <th className="text-left p-4 font-medium w-40">Stock Level</th>
                <th className="text-left p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {projectMaterials.map((item) => {
                const alloc = item.projectAllocations.find((a) => matchesProject(a.projectId, a.projectCode));
                // Raw materials: prefer the price THIS project actually paid (its own PO
                // line); fall back to the material's general unit value.
                const projectPrice = (materialPrices.get(item.id) ?? []).find(
                  (p) => p.projectCode && project && p.projectCode === project.code
                );
                const unitVal = projectPrice?.price ?? item.unitValue;
                const allocValue = alloc ? alloc.qty * unitVal : 0;
                return (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                    <td className="p-4">
                      <p className="font-medium text-card-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.code}</p>
                    </td>
                    <td className="p-4 text-muted-foreground">{item.category}</td>
                    <td className="p-4 text-right font-medium text-card-foreground">
                      {alloc?.qty.toLocaleString()}
                    </td>
                    <td className="p-4 text-muted-foreground">{item.unit}</td>
                    <td className="p-4 text-right font-medium text-card-foreground">
                      {allocValue > 0 ? formatCurrency(allocValue) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-4">
                      <StockBar level={item.stockLevel} />
                    </td>
                    <td className="p-4">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                );
              })}
              {projectMaterials.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No materials allocated to this project
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purchase Orders */}
      {projectPOs.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="p-5 border-b border-border">
            <h2 className="text-base font-heading font-semibold text-card-foreground">
              Purchase Orders ({projectPOs.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-4 font-medium">PO Number</th>
                  <th className="text-left p-4 font-medium">Supplier</th>
                  <th className="text-right p-4 font-medium">Amount</th>
                  <th className="text-left p-4 font-medium">Delivery Date</th>
                  <th className="text-left p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {projectPOs.map((po) => (
                  <tr key={po.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                    <td className="p-4 font-medium text-primary">{po.poNumber}</td>
                    <td className="p-4 text-card-foreground">{po.supplier}</td>
                    <td className="p-4 text-right font-medium text-card-foreground">
                      {formatCurrency(po.amount)}
                    </td>
                    <td className="p-4 text-muted-foreground text-xs">{po.deliveryDate}</td>
                    <td className="p-4">
                      <StatusBadge status={po.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
