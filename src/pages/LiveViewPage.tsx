import { useEffect, useMemo, useState } from "react";
import {
  Briefcase, DollarSign, FileText, Package, ShoppingCart, AlertTriangle, Building2, Sparkles, Printer, X,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/UIComponents";
import { useAppData } from "@/data/AppDataContext";
import {
  formatCurrency,
  timeAgo,
  type POStatus,
  type PurchaseOrder,
  type Project,
  type InventoryItem,
  type Claim,
  type Invoice,
} from "@/data/sampleData";
import { printPO } from "@/lib/poDocument";
import { cn } from "@/lib/utils";

type Detail =
  | { type: "po"; item: PurchaseOrder }
  | { type: "project"; item: Project }
  | { type: "material"; item: InventoryItem }
  | { type: "claim"; item: Claim }
  | { type: "invoice"; item: Invoice };

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-medium text-card-foreground break-words">{value}</p>
    </div>
  );
}

function DetailModal({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  const titles: Record<Detail["type"], string> = {
    po: "Purchase Order",
    project: "Project",
    material: "Material",
    claim: "Claim",
    invoice: "Supplier Invoice",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{titles[detail.type]}</p>
            <h2 className="text-lg font-heading font-semibold text-card-foreground">
              {detail.type === "po" && detail.item.poNumber}
              {detail.type === "project" && detail.item.name}
              {detail.type === "material" && detail.item.name}
              {detail.type === "claim" && detail.item.claimNumber}
              {detail.type === "invoice" && detail.item.invoiceNumber}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={detail.item.status} />
            <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {detail.type === "po" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Supplier" value={detail.item.supplier} />
                <Field label="Project" value={`${detail.item.project}${detail.item.projectCode ? ` (${detail.item.projectCode})` : ""}`} />
                <Field label="Created" value={detail.item.createdDate} />
                <Field label="Delivery Date" value={detail.item.deliveryDate} />
                <Field label="Ship To" value={detail.item.shipTo || detail.item.project} />
                <Field label="Payment Terms" value={detail.item.paymentTerms || "—"} />
                <Field label="Requested By" value={detail.item.requestedBy || "—"} />
                <Field label="Remarks" value={detail.item.remarks || "—"} />
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/50 text-muted-foreground">
                      <th className="text-left p-2 font-medium">Item</th>
                      <th className="text-right p-2 font-medium">Qty</th>
                      <th className="text-right p-2 font-medium">Unit Price</th>
                      <th className="text-right p-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.item.items.map((li, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 text-card-foreground">{li.material}</td>
                        <td className="p-2 text-right text-muted-foreground">{li.qty}</td>
                        <td className="p-2 text-right text-muted-foreground">{formatCurrency(li.unitPrice)}</td>
                        <td className="p-2 text-right font-medium text-card-foreground">{formatCurrency(li.qty * li.unitPrice)}</td>
                      </tr>
                    ))}
                    {detail.item.items.length === 0 && (
                      <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No line items recorded</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                <span className="text-muted-foreground">Subtotal {formatCurrency(detail.item.amount)} · GST {formatCurrency(detail.item.gst)}</span>
                <span className="text-lg font-heading font-bold text-card-foreground">{formatCurrency(detail.item.amount + detail.item.gst)}</span>
              </div>
              <div className="flex justify-end">
                <button onClick={() => printPO(detail.item)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
                  <Printer className="h-4 w-4" /> Print / PDF
                </button>
              </div>
            </>
          )}

          {detail.type === "project" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project Code" value={detail.item.code} />
              <Field label="Client" value={detail.item.client} />
              <Field label="Contract Value" value={formatCurrency(detail.item.budget)} />
              <Field label="Progress" value={`${detail.item.progress}%`} />
              <Field label="Sales Manager" value={detail.item.manager} />
              <Field label="Contact" value={detail.item.contactPerson} />
              <Field label="Awarded / Start" value={detail.item.startDate} />
              <Field label="Materials Allocated" value={detail.item.materialsAllocated} />
              <div className="col-span-2"><Field label="Scope of Work" value={detail.item.scope} /></div>
            </div>
          )}

          {detail.type === "material" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Item Code" value={detail.item.code} />
                <Field label="Category" value={detail.item.category} />
                <Field label="Supplier" value={detail.item.supplier} />
                <Field label="Location" value={detail.item.location} />
                <Field label="Qty On Hand" value={`${detail.item.totalQty} ${detail.item.unit}`} />
                <Field label="Alert Threshold" value={`${detail.item.alertThreshold} ${detail.item.unit}`} />
              </div>
              {detail.item.projectAllocations.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Project Allocations</p>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {detail.item.projectAllocations.map((a, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-card-foreground">{a.projectName}</span>
                        <span className="font-medium text-card-foreground">{a.qty} {detail.item.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {detail.type === "claim" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project" value={detail.item.projectName} />
              <Field label="Amount" value={formatCurrency(detail.item.amount)} />
              <Field label="Submitted" value={detail.item.submittedDate} />
              <Field label="Certified" value={detail.item.certifiedDate ?? "—"} />
              <Field label="Paid" value={detail.item.paidDate ?? "—"} />
              <div className="col-span-2"><Field label="Description" value={detail.item.description || "—"} /></div>
            </div>
          )}

          {detail.type === "invoice" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Supplier" value={detail.item.vendor} />
              <Field label="Amount (incl. GST)" value={detail.item.amount > 0 ? formatCurrency(detail.item.amount) : "Not recorded"} />
              <Field label="Invoice Date" value={detail.item.date} />
              <Field label="PO Reference" value={detail.item.poMatch ?? "—"} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/*
 * /v2 — Lightweight live presentation view (Build Plan v2).
 * Operations are driven by talking to Claude (Claude Desktop + Supabase MCP);
 * this screen just presents the data and refreshes automatically.
 */

const PIPELINE: { status: POStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "pending", label: "Pending" },
  { status: "approved", label: "Approved" },
  { status: "issued", label: "Issued" },
  { status: "delivered", label: "Delivered" },
  { status: "closed", label: "Closed" },
];

function Section({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card shadow-sm", className)}>
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-heading font-semibold text-card-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-heading font-bold text-card-foreground mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function LiveViewPage() {
  const { projects, inventory, purchaseOrders, invoices, claims, alerts, lastSyncedAt, isLoading } = useAppData();
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    document.title = "ConPlus — Live View";
    return () => { document.title = "ConPlus Operations"; };
  }, []);

  const activeProjects = projects.filter((p) => p.status === "active");
  const contractValue = projects.reduce((s, p) => s + p.budget, 0);
  const pendingPOs = purchaseOrders.filter((po) => po.status === "pending" || po.status === "draft");
  const stockIssues = inventory.filter((i) => i.status === "critical" || i.status === "out").length;
  const lowStock = inventory
    .filter((i) => (i.status === "low" || i.status === "critical") && i.totalQty > 0)
    .sort((a, b) => a.totalQty - b.totalQty)
    .slice(0, 8);
  const outstandingClaims = claims.filter((c) => c.status !== "paid").reduce((s, c) => s + c.amount, 0);
  const unpaidInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "rejected").length;

  const recentPOs = purchaseOrders.slice(0, 6);
  const recentClaims = claims.slice(0, 5);

  const topProjects = useMemo(
    () => [...projects].filter((p) => p.status === "active").sort((a, b) => b.budget - a.budget).slice(0, 8),
    [projects]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-heading text-base font-bold text-foreground tracking-tight">CONPLUS Resources — Live Operations</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                Operations run by talking to Claude · this view updates automatically
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
            </span>
            LIVE · synced {lastSyncedAt > 0 ? timeAgo(new Date(lastSyncedAt).toISOString()) : "..."}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {isLoading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            Connecting to database...
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Active Projects" value={activeProjects.length} sub={`${projects.length} total`} />
          <Kpi label="Contract Value" value={formatCurrency(contractValue)} />
          <Kpi label="POs Awaiting Action" value={pendingPOs.length} sub={`${purchaseOrders.length} total`} />
          <Kpi label="Stock Issues" value={stockIssues} sub="critical / out" />
          <Kpi label="Outstanding Claims" value={formatCurrency(outstandingClaims)} sub={`${claims.length} claims`} />
          <Kpi label="Open Invoices" value={unpaidInvoices} sub={`${invoices.length} on record`} />
        </div>

        {/* PO Pipeline */}
        <Section title="Purchase Order Pipeline" icon={<ShoppingCart className="h-4 w-4" />}>
          <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-border border-b border-border">
            {PIPELINE.map((col) => {
              const count = purchaseOrders.filter((po) => po.status === col.status).length;
              return (
                <div key={col.status} className="p-4 text-center">
                  <p className="text-2xl font-heading font-bold text-card-foreground">{count}</p>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-1">{col.label}</p>
                </div>
              );
            })}
          </div>
          <div className="divide-y divide-border">
            {recentPOs.map((po) => (
              <div
                key={po.id}
                onClick={() => setDetail({ type: "po", item: po })}
                className={cn("flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer hover:bg-secondary/40")}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium text-primary shrink-0">{po.poNumber}</span>
                  <span className="text-muted-foreground truncate">{po.supplier}</span>
                  <span className="text-xs text-muted-foreground/70 truncate hidden md:inline">{po.project}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium text-card-foreground">{formatCurrency(po.amount)}</span>
                  <StatusBadge status={po.status} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects */}
          <Section title="Top Active Projects" icon={<Briefcase className="h-4 w-4" />}>
            <div className="divide-y divide-border">
              {topProjects.map((p) => (
                <div key={p.id} onClick={() => setDetail({ type: "project", item: p })} className="px-4 py-3 cursor-pointer hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.code} · {p.client}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-card-foreground">{formatCurrency(p.budget)}</p>
                      <p className="text-xs text-muted-foreground">{p.materialsAllocated} materials</p>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary mt-2">
                    <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Low stock */}
          <Section title="Stock Watchlist" icon={<Package className="h-4 w-4" />}>
            <div className="divide-y divide-border">
              {lowStock.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">No low-stock items right now.</p>
              )}
              {lowStock.map((i) => (
                <div key={i.id} onClick={() => setDetail({ type: "material", item: i })} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-secondary/40 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-card-foreground truncate">{i.name}</p>
                    <p className="text-xs text-muted-foreground">{i.supplier} · {i.location}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-card-foreground">{i.totalQty} {i.unit}</span>
                    <StatusBadge status={i.status} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Claims */}
          <Section title="Claims" icon={<DollarSign className="h-4 w-4" />}>
            <div className="divide-y divide-border">
              {recentClaims.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">No claims on record yet — ask Claude to submit one.</p>
              )}
              {recentClaims.map((c) => (
                <div key={c.id} onClick={() => setDetail({ type: "claim", item: c })} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-secondary/40 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-primary">{c.claimNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.projectName}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-card-foreground">{formatCurrency(c.amount)}</span>
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Alerts */}
          <Section title="Active Alerts" icon={<AlertTriangle className="h-4 w-4" />}>
            <div className="divide-y divide-border">
              {alerts.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">No unresolved alerts.</p>
              )}
              {alerts.slice(0, 6).map((a) => (
                <div key={a.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className={cn("text-sm font-medium", a.severity === "high" ? "text-destructive" : "text-card-foreground")}>{a.title}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{a.timestamp}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.description}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Recent invoices */}
        <Section title="Supplier Invoices" icon={<FileText className="h-4 w-4" />}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Invoice #</th>
                  <th className="text-left px-4 py-3 font-medium">Supplier</th>
                  <th className="text-left px-4 py-3 font-medium">PO Ref</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 8).map((inv) => (
                  <tr key={inv.id} onClick={() => setDetail({ type: "invoice", item: inv })} className="border-b border-border last:border-0 cursor-pointer hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-primary">{inv.invoiceNumber}</td>
                    <td className="px-4 py-2.5 text-card-foreground">{inv.vendor}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{inv.poMatch ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-card-foreground">{inv.amount > 0 ? formatCurrency(inv.amount) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{inv.date}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <p className="text-center text-xs text-muted-foreground pb-6">
          ConPlus AI Transformation · v2 — Claude Desktop drives the data, this screen just watches it.
        </p>
      </main>

      {detail && <DetailModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
