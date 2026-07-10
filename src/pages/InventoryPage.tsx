import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Package, Plus, ArrowRightLeft, RefreshCw } from "lucide-react";
import { StatusBadge, StockBar } from "@/components/shared/UIComponents";
import { formatCurrency } from "@/data/sampleData";
import { useAppData } from "@/data/AppDataContext";
import { AddMaterialDialog, TransferDialog, UpdateStockDialog } from "@/components/InventoryDialogs";
import { cn } from "@/lib/utils";

export default function InventoryPage() {
  const navigate = useNavigate();
  const { inventory, projects, isLoading } = useAppData();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"master" | "project">("master");
  const [dialog, setDialog] = useState<"add" | "transfer" | "stock" | null>(null);

  const filtered = inventory.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()) || i.supplier.toLowerCase().includes(search.toLowerCase()));

  const activeProjects = projects.filter(
    (p) =>
      (p.status === "active" || p.status === "delayed") &&
      inventory.some((i) => i.projectAllocations.some((a) => a.projectId === p.id || a.projectCode === p.code))
  );

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">FLOW — Supply Chain Management</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setDialog("add")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Add Material
          </button>
          <button onClick={() => setDialog("transfer")} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
            <ArrowRightLeft className="h-4 w-4" /> Transfer
          </button>
          <button onClick={() => setDialog("stock")} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
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
                <th className="text-left p-4 font-medium">Supplier</th>
                <th className="text-left p-4 font-medium">Location</th>
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
                    <p className="text-xs text-muted-foreground">{item.code}</p>
                  </td>
                  <td className="p-4 text-muted-foreground">{item.category}</td>
                  <td className="p-4 text-muted-foreground">{item.supplier}</td>
                  <td className="p-4 text-xs text-muted-foreground">{item.location}</td>
                  <td className="p-4 text-right font-medium text-card-foreground">{item.totalQty.toLocaleString()}</td>
                  <td className="p-4 text-muted-foreground">{item.unit}</td>
                  <td className="p-4 text-right font-medium text-card-foreground">
                    {item.value > 0 ? formatCurrency(item.value) : <span className="text-muted-foreground" title="No price on record — fills in from PO pricing">—</span>}
                  </td>
                  <td className="p-4"><StockBar level={item.stockLevel} /></td>
                  <td className="p-4"><StatusBadge status={item.status} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    {isLoading ? "Loading inventory from database..." : "No materials match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeProjects.length === 0 && (
            <div className="col-span-full rounded-xl border border-border bg-card p-12 text-center">
              <p className="text-muted-foreground">No project allocations yet. Use the Transfer button to issue stock to a project.</p>
            </div>
          )}
          {activeProjects.map((project) => {
            const projectMaterials = inventory.filter((i) =>
              i.projectAllocations.some((a) => a.projectId === project.id || a.projectCode === project.code)
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

      <AddMaterialDialog open={dialog === "add"} onClose={() => setDialog(null)} />
      <TransferDialog open={dialog === "transfer"} onClose={() => setDialog(null)} />
      <UpdateStockDialog open={dialog === "stock"} onClose={() => setDialog(null)} />
    </div>
  );
}
