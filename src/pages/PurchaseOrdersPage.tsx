import { useState } from "react";
import { Plus, Search, Eye, GripVertical, CheckCircle, X, Printer } from "lucide-react";
import { StatusBadge } from "@/components/shared/UIComponents";
import { useAppData } from "@/data/AppDataContext";
import { formatCurrency, type POStatus, type PurchaseOrder } from "@/data/sampleData";
import { printPO } from "@/lib/poDocument";
import CreatePODialog from "@/components/CreatePODialog";
import { cn } from "@/lib/utils";

function PODetailDialog({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-heading font-semibold text-card-foreground">{po.poNumber}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{po.supplier} · {po.project}</p>
          </div>
          <StatusBadge status={po.status} />
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Created</p>
              <p className="font-medium text-card-foreground">{po.createdDate}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Delivery Date</p>
              <p className="font-medium text-card-foreground">{po.deliveryDate}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Ship To</p>
              <p className="font-medium text-card-foreground">{po.shipTo || po.project}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Payment Terms</p>
              <p className="font-medium text-card-foreground">{po.paymentTerms || "—"}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Requested By</p>
              <p className="font-medium text-card-foreground">{po.requestedBy || "—"}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Remarks</p>
              <p className="font-medium text-card-foreground">{po.remarks || "—"}</p>
            </div>
            {po.supplierAddress && (
              <div className="col-span-2 rounded-lg border border-border p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Vendor Address</p>
                <p className="text-xs text-card-foreground">{po.supplierAddress}</p>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/50 text-muted-foreground">
                  <th className="text-left p-2 font-medium">Item</th>
                  <th className="text-right p-2 font-medium">Qty</th>
                  <th className="text-right p-2 font-medium">Unit Price</th>
                  <th className="text-right p-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((li, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2 text-card-foreground">{li.material}</td>
                    <td className="p-2 text-right text-muted-foreground">{li.qty}</td>
                    <td className="p-2 text-right text-muted-foreground">{formatCurrency(li.unitPrice)}</td>
                    <td className="p-2 text-right font-medium text-card-foreground">{formatCurrency(li.qty * li.unitPrice)}</td>
                  </tr>
                ))}
                {po.items.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No line items recorded</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
            <span className="text-muted-foreground">Subtotal {formatCurrency(po.amount)} · GST {formatCurrency(po.gst)}</span>
            <span className="text-lg font-heading font-bold text-card-foreground">{formatCurrency(po.amount + po.gst)}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => printPO(po)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const kanbanCols: { status: POStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "pending", label: "Pending Approval" },
  { status: "approved", label: "Approved" },
  { status: "issued", label: "Issued" },
  { status: "delivered", label: "Delivered" },
  { status: "closed", label: "Closed" },
];

export default function PurchaseOrdersPage() {
  const { purchaseOrders, updatePOStatus, isLoading } = useAppData();
  const [view, setView] = useState<"list" | "kanban">("list");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailPO, setDetailPO] = useState<string | null>(null);

  const filtered = purchaseOrders.filter((po) =>
    po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
    po.supplier.toLowerCase().includes(search.toLowerCase()) ||
    po.project.toLowerCase().includes(search.toLowerCase())
  );

  const handleApprove = (poId: string) => updatePOStatus(poId, "approved");
  const handleReject = (poId: string) => updatePOStatus(poId, "rejected");
  const selectedPO = purchaseOrders.find((p) => p.id === detailPO);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">FLOW — Order Fulfillment</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
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
                <tr
                  key={po.id}
                  onClick={() => setDetailPO(po.id)}
                  className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer"
                >
                  <td className="p-4 font-medium text-primary">{po.poNumber}</td>
                  <td className="p-4 text-card-foreground">{po.supplier}</td>
                  <td className="p-4 text-muted-foreground text-xs">{po.project}</td>
                  <td className="p-4 text-right font-medium text-card-foreground">{formatCurrency(po.amount)}</td>
                  <td className="p-4"><StatusBadge status={po.status} /></td>
                  <td className="p-4 text-muted-foreground text-xs">{po.createdDate}</td>
                  <td className="p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      {po.status === "pending" || po.status === "draft" ? (
                        <>
                          <button
                            onClick={() => handleApprove(po.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-success/10 text-success hover:bg-success hover:text-success-foreground transition-colors text-xs font-medium"
                          >
                            <CheckCircle className="h-3 w-3" /> Approve
                          </button>
                          <button
                            onClick={() => handleReject(po.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors text-xs font-medium"
                          >
                            <X className="h-3 w-3" /> Reject
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setDetailPO(po.id)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="View details">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => printPO(po)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Print / Save as PDF">
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {isLoading ? "Loading purchase orders from database..." : "No purchase orders match your search."}
                  </td>
                </tr>
              )}
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
                    <div
                      key={po.id}
                      onClick={() => setDetailPO(po.id)}
                      className="rounded-lg border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-primary">{po.poNumber}</span>
                        <GripVertical className="h-3 w-3 text-muted-foreground/40" />
                      </div>
                      <p className="text-xs text-card-foreground font-medium truncate">{po.supplier}</p>
                      <p className="text-[10px] text-muted-foreground truncate mt-1">{po.project}</p>
                      <div className="flex items-center justify-between mt-2 mb-2">
                        <span className="text-sm font-bold text-card-foreground">{formatCurrency(po.amount)}</span>
                        <span className="text-[10px] text-muted-foreground">{po.deliveryDate}</span>
                      </div>
                      {(po.status === "pending" || po.status === "draft") && (
                        <div className="flex gap-1 pt-2 border-t border-border" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleApprove(po.id)}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-success/10 text-success hover:bg-success hover:text-success-foreground transition-colors"
                          >
                            <CheckCircle className="h-2.5 w-2.5" /> Approve
                          </button>
                          <button
                            onClick={() => handleReject(po.id)}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                          >
                            <X className="h-2.5 w-2.5" /> Reject
                          </button>
                        </div>
                      )}
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

      <CreatePODialog open={showCreate} onClose={() => setShowCreate(false)} />
      {selectedPO && <PODetailDialog po={selectedPO} onClose={() => setDetailPO(null)} />}
    </div>
  );
}
