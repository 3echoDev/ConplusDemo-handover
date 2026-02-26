import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Package, Plus, ArrowRightLeft, RefreshCw } from "lucide-react";
import { StatusBadge, StockBar } from "@/components/shared/UIComponents";
import { inventory, projects, formatCurrency } from "@/data/sampleData";
import { cn } from "@/lib/utils";

export default function InventoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"master" | "project">("project");
  const [selectedProject, setSelectedProject] = useState(projects[0].id);

  const filtered = inventory.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()));

  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "delayed");
  const projectItems = inventory.filter((i) => i.projectAllocations.some((a) => a.projectId === selectedProject));
  const selectedProjectName = projects.find((p) => p.id === selectedProject)?.name || "";

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">FLOW — Supply Chain Management</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Add Material
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
            <ArrowRightLeft className="h-4 w-4" /> Transfer
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
            <RefreshCw className="h-4 w-4" /> Update Stock
          </button>
        </div>
      </div>

      {/* Search & Tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials..."
            className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setTab("master")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === "master" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
            Master Inventory
          </button>
          <button onClick={() => setTab("project")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === "project" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
            Per-Project View
          </button>
        </div>
      </div>

      {tab === "master" ? (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left p-4 font-medium">Material</th>
                <th className="text-left p-4 font-medium">Category</th>
                <th className="text-right p-4 font-medium">Qty</th>
                <th className="text-left p-4 font-medium">Unit</th>
                <th className="text-right p-4 font-medium">Value</th>
                <th className="text-left p-4 font-medium w-40">Stock Level</th>
                <th className="text-left p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                  <td className="p-4">
                    <p className="font-medium text-card-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.id}</p>
                  </td>
                  <td className="p-4 text-muted-foreground">{item.category}</td>
                  <td className="p-4 text-right font-medium text-card-foreground">{item.totalQty.toLocaleString()}</td>
                  <td className="p-4 text-muted-foreground">{item.unit}</td>
                  <td className="p-4 text-right font-medium text-card-foreground">{formatCurrency(item.value)}</td>
                  <td className="p-4"><StockBar level={item.stockLevel} /></td>
                  <td className="p-4"><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeProjects.map((project) => {
            const projectMaterials = inventory.filter((i) =>
              i.projectAllocations.some((a) => a.projectId === project.id)
            );

            return (
              <div
                key={project.id}
                className="rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all cursor-pointer group"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-heading font-semibold text-card-foreground group-hover:text-primary transition-colors">{project.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{project.location}</p>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium text-card-foreground">{project.progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary">
                        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${project.progress}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Materials</p>
                        <p className="text-sm font-semibold text-card-foreground">{projectMaterials.length}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Budget</p>
                        <p className="text-sm font-semibold text-card-foreground">{formatCurrency(project.budget)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
