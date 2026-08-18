import { useEffect, useMemo, useState } from "react";
import {
  Briefcase, DollarSign, FileText, Package, ShoppingCart, AlertTriangle, Building2, Sparkles, Printer, X, Search, ClipboardList, Layers,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/UIComponents";
import ExportMenu from "@/components/ExportMenu";
import type { ExportColumn } from "@/lib/exportData";
import { useAppData } from "@/data/AppDataContext";
import {
  formatCurrency,
  timeAgo,
  type POStatus,
  type PurchaseOrder,
  type WorksOrder,
  type WOStatus,
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

// Project popup: contract value expands into main + VO breakdown; cum progress
// claims expand into the claim-by-claim list (client amendment items 7–9).
function ProjectDetailBody({ project }: { project: Project }) {
  const { projects, projectVOs, claims } = useAppData();
  const [showVOs, setShowVOs] = useState(false);
  const [showClaims, setShowClaims] = useState(false);

  const tableVOs = projectVOs.filter((v) => v.projectId === project.id || v.projectCode === project.code);
  const familyKey = (code: string) => code.split(" (")[0].trim().replace(/^[A-Z]+/i, "");
  const legacyVOs = projects.filter((p) => p.id !== project.id && familyKey(p.code) === familyKey(project.code));
  const mainContract = Math.max(0, project.budget - tableVOs.reduce((s, v) => s + v.amount, 0));

  const projClaims = claims.filter((c) => c.projectId === project.id || c.projectName === project.name);
  const cumClaims = projClaims.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project Code" value={project.code} />
        <Field label="Client" value={project.client} />
        <div className="rounded-lg border border-border p-3 cursor-pointer hover:bg-secondary/40 transition-colors" onClick={() => setShowVOs(!showVOs)}>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Contract Value {tableVOs.length + legacyVOs.length > 0 ? "▾" : ""}</p>
          <p className="text-sm font-medium text-primary">{formatCurrency(project.budget)}</p>
        </div>
        <div className="rounded-lg border border-border p-3 cursor-pointer hover:bg-secondary/40 transition-colors" onClick={() => setShowClaims(!showClaims)}>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Cum Progress Claim {projClaims.length > 0 ? "▾" : ""}</p>
          <p className="text-sm font-medium text-primary">{formatCurrency(cumClaims)}</p>
        </div>
        <Field label="Sales Manager" value={project.manager} />
        <Field label="Contact" value={project.contactPerson} />
        <Field label="Client PO" value={project.clientPo || "—"} />
        <Field label="Awarded / Start" value={project.startDate} />
        {project.location !== "Singapore" && <div className="col-span-2"><Field label="Site Address" value={project.location} /></div>}
        {project.companyAddress && <div className="col-span-2"><Field label="Company Address" value={project.companyAddress} /></div>}
        <div className="col-span-2"><Field label="Scope of Work" value={project.scope} /></div>
      </div>

      {showVOs && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-secondary/50 px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Contract Value Breakdown</div>
          <div className="divide-y divide-border text-sm">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-card-foreground">Main Contract</span>
              <span className="font-medium text-card-foreground">{formatCurrency(mainContract)}</span>
            </div>
            {tableVOs.map((vo) => (
              <div key={vo.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-card-foreground min-w-0 truncate">{vo.voNumber || "VO"}{vo.quotationRef ? ` · ${vo.quotationRef}` : ""}</span>
                <span className="font-medium text-card-foreground shrink-0">{formatCurrency(vo.amount)}</span>
              </div>
            ))}
            {legacyVOs.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-card-foreground min-w-0 truncate">{p.code}</span>
                <span className="font-medium text-card-foreground shrink-0">{formatCurrency(p.budget)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-secondary/30">
              <span className="font-semibold text-card-foreground">Total{legacyVOs.length > 0 ? " (family combined)" : ""}</span>
              <span className="font-bold text-card-foreground">{formatCurrency(project.budget + legacyVOs.reduce((s, p) => s + p.budget, 0))}</span>
            </div>
          </div>
        </div>
      )}

      {showClaims && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-secondary/50 px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Progress Claims</div>
          <div className="divide-y divide-border text-sm">
            {projClaims.length === 0 && <p className="px-3 py-3 text-muted-foreground text-xs">No claims recorded for this project yet.</p>}
            {projClaims.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-card-foreground min-w-0 truncate">{c.claimNumber} · {c.submittedDate}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-medium text-card-foreground">{formatCurrency(c.amount)}</span>
                  <StatusBadge status={c.status} />
                </span>
              </div>
            ))}
            {projClaims.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-secondary/30">
                <span className="font-semibold text-card-foreground">Cumulative</span>
                <span className="font-bold text-card-foreground">{formatCurrency(cumClaims)}</span>
              </div>
            )}
          </div>
        </div>
      )}
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

          {detail.type === "project" && <ProjectDetailBody project={detail.item} />}

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

const WO_PIPELINE: { status: WOStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "created", label: "Created" },
  { status: "confirmed", label: "Confirmed" },
  { status: "pending_completion", label: "In Progress" },
  { status: "completed", label: "Completed" },
];

const COLS = {
  works: [
    { header: "WO No", value: (w: WorksOrder) => w.woNumber },
    { header: "Project", value: (w: WorksOrder) => w.projectCode },
    { header: "Client", value: (w: WorksOrder) => w.clientName },
    { header: "Site", value: (w: WorksOrder) => w.siteAddress },
    { header: "Areas", value: (w: WorksOrder) => w.areas.length },
    { header: "Total Sets", value: (w: WorksOrder) => woTotalOf(w) },
    { header: "Status", value: (w: WorksOrder) => w.status.replace(/_/g, " ") },
  ] as ExportColumn<WorksOrder>[],
  pos: [
    { header: "PO No", value: (p: PurchaseOrder) => p.poNumber },
    { header: "Supplier", value: (p: PurchaseOrder) => p.supplier },
    { header: "Project Code", value: (p: PurchaseOrder) => p.projectCode },
    { header: "Project", value: (p: PurchaseOrder) => p.project },
    { header: "Works Order", value: (p: PurchaseOrder) => p.worksOrder },
    { header: "Amount", value: (p: PurchaseOrder) => p.amount },
    { header: "Status", value: (p: PurchaseOrder) => p.status },
    { header: "Delivery Date", value: (p: PurchaseOrder) => p.deliveryDate },
  ] as ExportColumn<PurchaseOrder>[],
  projects: [
    { header: "Project Code", value: (p: Project) => p.code },
    { header: "Project Name", value: (p: Project) => p.name },
    { header: "Client Name", value: (p: Project) => p.client },
    { header: "Contract Sum", value: (p: Project) => p.budget },
    { header: "Actual Cost", value: (p: Project) => p.actual },
    { header: "Progress %", value: (p: Project) => p.progress },
    { header: "Claims Status", value: (p: Project) => p.claimsStatus },
    { header: "Quotation Ref", value: (p: Project) => p.quotationRef },
    { header: "Year Awarded", value: (p: Project) => p.yearAwarded },
    { header: "Status", value: (p: Project) => p.status },
  ] as ExportColumn<Project>[],
  claims: [
    { header: "Claim No", value: (c: Claim) => c.claimNumber },
    { header: "Project", value: (c: Claim) => c.projectName },
    { header: "Description", value: (c: Claim) => c.description },
    { header: "Amount", value: (c: Claim) => c.amount },
    { header: "Submitted", value: (c: Claim) => c.submittedDate },
    { header: "Certified", value: (c: Claim) => c.certifiedDate ?? "" },
    { header: "Paid", value: (c: Claim) => c.paidDate ?? "" },
    { header: "Status", value: (c: Claim) => c.status },
  ] as ExportColumn<Claim>[],
  invoices: [
    { header: "Invoice No", value: (i: Invoice) => i.invoiceNumber },
    { header: "Supplier", value: (i: Invoice) => i.vendor },
    { header: "PO Ref", value: (i: Invoice) => i.poMatch ?? "" },
    { header: "Amount", value: (i: Invoice) => i.amount },
    { header: "Date", value: (i: Invoice) => i.date },
    { header: "Status", value: (i: Invoice) => i.status },
  ] as ExportColumn<Invoice>[],
};

const woTotalOf = (wo: WorksOrder) =>
  wo.areas.reduce((s, a) => s + a.lines.reduce((t, l) => t + (l.requiredQty ?? 0), 0), 0);

const woTotal = (wo: WorksOrder) =>
  wo.areas.reduce((s, a) => s + a.lines.reduce((t, l) => t + (l.requiredQty ?? 0), 0), 0);

function Section({ title, icon, children, className, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card shadow-sm", className)}>
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-border">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-heading font-semibold text-card-foreground flex-1">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search..."}
        className="w-44 rounded-lg border border-input bg-background pl-8 pr-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
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
  const { projects, inventory, purchaseOrders, invoices, claims, alerts, worksOrders, lastSyncedAt, isLoading } = useAppData();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [poSearch, setPoSearch] = useState("");
  const [woSearch, setWoSearch] = useState("");
  const [openWO, setOpenWO] = useState<string | null>(null);
  const [projSearch, setProjSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [claimSearch, setClaimSearch] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");

  useEffect(() => {
    document.title = "ConPlus — Live View";
    return () => { document.title = "ConPlus Operations"; };
  }, []);

  const has = (hay: string | null | undefined, needle: string) =>
    (hay ?? "").toLowerCase().includes(needle.toLowerCase());

  const activeProjects = projects.filter((p) => p.status === "active");
  const contractValue = projects.reduce((s, p) => s + p.budget, 0);
  const pendingPOs = purchaseOrders.filter((po) => po.status === "pending" || po.status === "draft");
  const stockIssues = inventory.filter((i) => i.status === "critical" || i.status === "out").length;
  const outstandingClaims = claims.filter((c) => c.status !== "paid").reduce((s, c) => s + c.amount, 0);
  const unpaidInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "rejected").length;

  const lowStock = useMemo(() => {
    const base = stockSearch
      ? inventory.filter((i) => has(i.name, stockSearch) || has(i.supplier, stockSearch) || has(i.code, stockSearch))
      : inventory.filter((i) => (i.status === "low" || i.status === "critical") && i.totalQty > 0);
    return [...base].sort((a, b) => a.totalQty - b.totalQty).slice(0, stockSearch ? 15 : 8);
  }, [inventory, stockSearch]);

  const woFiltered = useMemo(() => {
    const base = woSearch
      ? worksOrders.filter(
          (w) =>
            has(w.woNumber, woSearch) ||
            has(w.projectCode, woSearch) ||
            has(w.clientName, woSearch) ||
            has(w.siteAddress, woSearch),
        )
      : worksOrders;
    return base.slice(0, woSearch ? 15 : 6);
  }, [worksOrders, woSearch]);

  const recentPOs = useMemo(() => {
    const base = poSearch
      ? purchaseOrders.filter((po) => has(po.poNumber, poSearch) || has(po.supplier, poSearch) || has(po.project, poSearch) || has(po.projectCode, poSearch))
      : purchaseOrders;
    return base.slice(0, poSearch ? 15 : 6);
  }, [purchaseOrders, poSearch]);

  const recentClaims = useMemo(() => {
    const base = claimSearch
      ? claims.filter((c) => has(c.claimNumber, claimSearch) || has(c.projectName, claimSearch) || has(c.description, claimSearch))
      : claims;
    return base.slice(0, claimSearch ? 15 : 5);
  }, [claims, claimSearch]);

  const shownInvoices = useMemo(() => {
    const base = invSearch
      ? invoices.filter((i) => has(i.invoiceNumber, invSearch) || has(i.vendor, invSearch) || has(i.poMatch, invSearch))
      : invoices;
    return base.slice(0, invSearch ? 15 : 8);
  }, [invoices, invSearch]);

  // Projects: search + From/To (year awarded) filter show ALL matches;
  // otherwise the default view is the top active projects by contract value.
  const projFiltered = projSearch !== "" || yearFrom !== "" || yearTo !== "";
  const topProjects = useMemo(() => {
    const yearOf = (p: { yearAwarded: string; code: string }) => {
      const m = (p.yearAwarded || "").match(/\d{4}/);
      if (m) return parseInt(m[0], 10);
      const c = p.code.match(/^[A-Z]+(\d{2})/i);
      return c ? 2000 + parseInt(c[1], 10) : 0;
    };
    let base = projects.filter((p) => p.status === "active");
    if (projSearch) {
      base = base.filter((p) => has(p.name, projSearch) || has(p.code, projSearch) || has(p.client, projSearch));
    }
    if (yearFrom) base = base.filter((p) => yearOf(p) >= parseInt(yearFrom, 10));
    if (yearTo) base = base.filter((p) => yearOf(p) <= parseInt(yearTo, 10));
    const sorted = [...base].sort((a, b) => b.budget - a.budget);
    return projFiltered ? sorted : sorted.slice(0, 8);
  }, [projects, projSearch, yearFrom, yearTo, projFiltered]);

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

        {/* Works Orders — what each job needs, before anything is ordered */}
        <Section
          title="Works Orders"
          icon={<ClipboardList className="h-4 w-4" />}
          action={<div className="flex items-center gap-1.5"><SearchBox value={woSearch} onChange={setWoSearch} placeholder="Search WO, project, site..." /><ExportMenu rows={woFiltered} columns={COLS.works} title="Works Orders" /></div>}
        >
          <div className="grid grid-cols-3 md:grid-cols-5 divide-x divide-border border-b border-border">
            {WO_PIPELINE.map((col) => {
              const count = worksOrders.filter((w) => w.status === col.status).length;
              return (
                <div key={col.status} className="p-4 text-center">
                  <p className="text-2xl font-heading font-bold text-card-foreground">{count}</p>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-1">{col.label}</p>
                </div>
              );
            })}
          </div>
          {woFiltered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No works orders yet — a works order records what a job needs before anything is ordered.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {woFiltered.map((wo) => {
                const isOpen = openWO === wo.id;
                const sets = woTotal(wo);
                return (
                  <div key={wo.id}>
                    <div
                      onClick={() => setOpenWO(isOpen ? null : wo.id)}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-medium text-primary shrink-0">WO {wo.woNumber}</span>
                        <span className="text-muted-foreground truncate">{wo.projectCode}</span>
                        <span className="text-xs text-muted-foreground/70 truncate hidden md:inline">{wo.siteAddress || wo.clientName}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-medium text-card-foreground">{sets} sets</span>
                        <StatusBadge status={wo.status.replace(/_/g, "-")} />
                      </div>
                    </div>

                    {isOpen && (
                      <div className="bg-secondary/20 px-4 py-3 space-y-3">
                        {wo.areas.map((area) => (
                          <div key={area.id} className="rounded-lg border border-border bg-card overflow-hidden">
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border">
                              <span className="flex items-center gap-1.5 text-sm font-medium text-card-foreground">
                                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                                {area.areaName}
                                {area.ralColour && (
                                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{area.ralColour}</span>
                                )}
                              </span>
                              {area.areaSqm != null && (
                                <span className="text-xs text-muted-foreground">{area.areaSqm.toLocaleString()} m²</span>
                              )}
                            </div>
                            <table className="w-full text-sm">
                              <tbody className="divide-y divide-border">
                                {area.lines.map((l) => (
                                  <tr key={l.id}>
                                    <td className="px-3 py-1.5 text-card-foreground">{l.description}</td>
                                    <td className="px-2 py-1.5 text-xs text-muted-foreground text-right whitespace-nowrap">
                                      {l.dosage != null ? `${l.dosage} ${l.dosageUnit}` : ""}
                                    </td>
                                    <td className="px-2 py-1.5 text-xs text-muted-foreground text-right whitespace-nowrap">
                                      {l.packingSize != null ? `${l.packingSize} ${l.packingUnit}` : ""}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-semibold text-card-foreground whitespace-nowrap">
                                      {l.isMixComponent ? <span className="text-xs font-normal text-muted-foreground">mix</span> : `${l.requiredQty ?? "—"} ${l.qtyUnit}`}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* PO Pipeline */}
        <Section
          title="Purchase Order Pipeline"
          icon={<ShoppingCart className="h-4 w-4" />}
          action={<div className="flex items-center gap-1.5"><SearchBox value={poSearch} onChange={setPoSearch} placeholder="Search PO, supplier..." /><ExportMenu rows={recentPOs} columns={COLS.pos} title="Purchase Orders" /></div>}
        >
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
          <Section
            title={projFiltered ? `Projects (${topProjects.length} match)` : "Top Active Projects"}
            icon={<Briefcase className="h-4 w-4" />}
            action={
              <div className="flex items-center gap-1.5">
                <SearchBox value={projSearch} onChange={setProjSearch} placeholder="Search projects..." />
                <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="From" title="Year awarded from" className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                <input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="To" title="Year awarded to" className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                <ExportMenu rows={topProjects} columns={COLS.projects} title="Project List" />
              </div>
            }
          >
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
          <Section
            title={stockSearch ? "Stock Search" : "Stock Watchlist"}
            icon={<Package className="h-4 w-4" />}
            action={<SearchBox value={stockSearch} onChange={setStockSearch} placeholder="Search all stock..." />}
          >
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
          <Section
            title="Claims"
            icon={<DollarSign className="h-4 w-4" />}
            action={<div className="flex items-center gap-1.5"><SearchBox value={claimSearch} onChange={setClaimSearch} placeholder="Search claims..." /><ExportMenu rows={recentClaims} columns={COLS.claims} title="Claims" /></div>}
          >
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
        <Section
          title="Supplier Invoices"
          icon={<FileText className="h-4 w-4" />}
          action={<div className="flex items-center gap-1.5"><SearchBox value={invSearch} onChange={setInvSearch} placeholder="Search invoices..." /><ExportMenu rows={shownInvoices} columns={COLS.invoices} title="Supplier Invoices" /></div>}
        >
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
                {shownInvoices.map((inv) => (
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
