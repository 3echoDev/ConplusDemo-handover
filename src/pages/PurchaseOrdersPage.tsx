import { useState } from "react";
import { Plus, Search, Eye, Download, XCircle, MoreHorizontal, GripVertical } from "lucide-react";
import { StatusBadge } from "@/components/shared/UIComponents";
import { purchaseOrders, formatCurrency, type POStatus } from "@/data/sampleData";
import { cn } from "@/lib/utils";

const kanbanCols: { status: POStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "pending", label: "Pending Approval" },
  { status: "approved", label: "Approved" },
  { status: "issued", label: "Issued" },
  { status: "delivered", label: "Delivered" },
  { status: "closed", label: "Closed" },
];

export default function PurchaseOrdersPage() {
  const [view, setView] = useState<"list" | "kanban">("list");
  const [search, setSearch] = useState("");

  const filtered = purchaseOrders.filter((po) =>
    po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
    po.supplier.toLowerCase().includes(search.toLowerCase()) ||
    po.project.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">FLOW — Order Fulfillment</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Create PO
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO, supplier, project..." className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setView("list")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", view === "list" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>List</button>
          <button onClick={() => setView("kanban")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", view === "kanban" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>Pipeline</button>
        </div>
      </div>

      {view === "list" ? (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left p-4 font-medium">PO Number</th>
                <th className="text-left p-4 font-medium">Supplier</th>
                <th className="text-left p-4 font-medium">Project</th>
                <th className="text-right p-4 font-medium">Amount</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Created</th>
                <th className="text-center p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((po) => (
                <tr key={po.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                  <td className="p-4 font-medium text-primary">{po.poNumber}</td>
                  <td className="p-4 text-card-foreground">{po.supplier}</td>
                  <td className="p-4 text-muted-foreground text-xs">{po.project}</td>
                  <td className="p-4 text-right font-medium text-card-foreground">{formatCurrency(po.amount)}</td>
                  <td className="p-4"><StatusBadge status={po.status} /></td>
                  <td className="p-4 text-muted-foreground text-xs">{po.createdDate}</td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"><Eye className="h-3.5 w-3.5" /></button>
                      <button className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"><Download className="h-3.5 w-3.5" /></button>
                      <button className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><XCircle className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanCols.map((col) => {
            const cards = purchaseOrders.filter((po) => po.status === col.status);
            return (
              <div key={col.status} className="min-w-[260px] w-[260px] shrink-0 rounded-xl bg-secondary/50 border border-border">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{col.label}</span>
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded-full px-2 py-0.5">{cards.length}</span>
                </div>
                <div className="p-2 space-y-2">
                  {cards.map((po) => (
                    <div key={po.id} className="rounded-lg border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-primary">{po.poNumber}</span>
                        <GripVertical className="h-3 w-3 text-muted-foreground/40" />
                      </div>
                      <p className="text-xs text-card-foreground font-medium truncate">{po.supplier}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-card-foreground">{formatCurrency(po.amount)}</span>
                        <span className="text-[10px] text-muted-foreground">{po.deliveryDate}</span>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="p-4 text-center text-xs text-muted-foreground">No items</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
