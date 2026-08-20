import { useEffect, useMemo, useState } from "react";
import {
  Briefcase, DollarSign, FileText, Package, ShoppingCart, AlertTriangle, Building2, Sparkles, Printer, X, Search, ClipboardList, Layers, FileSpreadsheet,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/UIComponents";
import ExportMenu from "@/components/ExportMenu";
import ActivityLog from "@/components/ActivityLog";
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
import { printPO, exportPOToExcel } from "@/lib/poDocument";
import { printWO, exportWOToExcel, woOrderTotal } from "@/lib/woDocument";
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
  const { projects, projectVOs, claims, purchaseOrders, worksOrders, invoices } = useAppData();
  const [showVOs, setShowVOs] = useState(false);
  const [showClaims, setShowClaims] = useState(false);
  const [docType, setDocType] = useState<DocKind | "all">("all");

  const tableVOs = projectVOs.filter((v) => v.projectId === project.id || v.projectCode === project.code);
  const familyKey = (code: string) => code.split(" (")[0].trim().replace(/^[A-Z]+/i, "");
  const legacyVOs = projects.filter((p) => p.id !== project.id && familyKey(p.code) === familyKey(project.code));
  const mainContract = Math.max(0, project.budget - tableVOs.reduce((s, v) => s + v.amount, 0));

  const projPOs = purchaseOrders.filter((p) => p.projectId === project.id || p.projectCode === project.code);
  const projWOs = worksOrders.filter((w) => w.projectId === project.id || w.projectCode === project.code);
  const projInvoices = invoices.filter((i) => projPOs.some((p) => p.poNumber === i.poMatch));

  const documents: ProjectDoc[] = [
    ...(project.quotationRef
      ? [{ kind: "Quotation" as DocKind, ref: project.quotationRef, date: project.startDate, amount: project.budget, status: "" }]
      : []),
    ...projWOs.map((w) => ({
      kind: "WO" as DocKind,
      ref: `WO ${w.woNumber}`,
      date: w.startDate ?? "",
      amount: null,
      status: w.status.replace(/_/g, " "),
    })),
    ...projPOs.map((p) => ({
      kind: "PO" as DocKind,
      ref: p.poNumber,
      date: p.createdDate,
      amount: p.amount,
      status: p.status,
    })),
    ...projInvoices.map((i) => ({
      kind: "Invoice" as DocKind,
      ref: i.invoiceNumber,
      date: i.date,
      amount: i.amount,
      status: i.status,
    })),
  ];

  const projClaims = claims.filter((c) => c.projectId === project.id || c.projectName === project.name);
  const cumClaims = projClaims.reduce((s, c) => s + c.amount, 0);

  const allDocs: ProjectDoc[] = [
    ...documents,
    ...projClaims.map((c) => ({
      kind: "Claim" as DocKind,
      ref: c.claimNumber,
      date: c.submittedDate,
      amount: c.amount,
      status: c.status,
    })),
  ].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const shownDocs = docType === "all" ? allDocs : allDocs.filter((d) => d.kind === docType);

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

      {/* All documents for this project, in one place */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary/50 px-3 py-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Documents ({allDocs.length})
          </span>
          <div className="flex items-center gap-1.5">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocKind | "all")}
              className="rounded-lg border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All types</option>
              {DOC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <ExportMenu rows={shownDocs} columns={COLS.docs} title={`${project.code} Documents`} />
          </div>
        </div>
        <div className="divide-y divide-border text-sm">
          {shownDocs.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">No documents of this type for this project.</p>
          )}
          {shownDocs.map((d, i) => (
            <div key={`${d.kind}-${d.ref}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {d.kind}
                </span>
                <span className="truncate text-card-foreground">{d.ref}</span>
                {d.date && <span className="shrink-0 text-xs text-muted-foreground">{d.date}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {d.amount != null && <span className="font-medium text-card-foreground">{formatCurrency(d.amount)}</span>}
                {d.status && <StatusBadge status={d.status} />}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ActivityLog recordId={project.id} />
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
                <button onClick={() => exportPOToExcel(detail.item)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
                  <FileSpreadsheet className="h-4 w-4 text-success" /> Excel
                </button>
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

          {detail.type === "claim" && <ClaimDetailBody claim={detail.item} />}

          {detail.type === "invoice" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Supplier" value={detail.item.vendor} />
              <Field label="Amount (incl. GST)" value={detail.item.amount > 0 ? formatCurrency(detail.item.amount) : "Not recorded"} />
              <Field label="Invoice Date" value={detail.item.date} />
              <Field label="PO Reference" value={detail.item.poMatch ?? "—"} />
            </div>
          )}

          {detail.type !== "claim" && <ActivityLog recordId={detail.item.id} />}
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
  docs: [
    { header: "Type", value: (d: ProjectDoc) => d.kind },
    { header: "Reference", value: (d: ProjectDoc) => d.ref },
    { header: "Date", value: (d: ProjectDoc) => d.date },
    { header: "Amount", value: (d: ProjectDoc) => d.amount ?? "" },
    { header: "Status", value: (d: ProjectDoc) => d.status },
  ] as ExportColumn<ProjectDoc>[],
};

/**
 * Progress claim or internal invoice?
 * Their own data already distinguishes them: progress claims on contract work
 * carry retention and a CLM- number; small maintenance jobs (M-prefix projects,
 * 310xxx/YYYY/MM numbering) are billed once with no retention.
 * This is a DISPLAY rule — if the client confirms Conplus invoices are really a
 * works-order state rather than a document, only this function changes.
 */
const isInternalInvoice = (c: Claim) =>
  /^M/i.test(c.projectCode ?? "") || /^\d{6}\//.test(c.claimNumber ?? "");

/** Dates are ISO (YYYY-MM-DD), so a string compare is a date compare. */
const inRange = (d: string | null | undefined, from: string, to: string) => {
  if (!d) return !from && !to;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

type DocKind = "Quotation" | "WO" | "PO" | "Invoice" | "Claim";
const DOC_KINDS: DocKind[] = ["Quotation", "WO", "PO", "Invoice", "Claim"];

interface ProjectDoc {
  kind: DocKind;
  ref: string;
  date: string;
  amount: number | null;
  status: string;
}

const woTotalOf = (wo: WorksOrder) => woOrderTotal(wo);

const woTotal = (wo: WorksOrder) => woOrderTotal(wo);

function ClaimDetailBody({ claim }: { claim: Claim }) {
  const { updateClaimFields } = useAppData();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const { projects } = useAppData();
  const project = projects.find((p) => p.id === claim.projectId || p.code === claim.projectCode);
  const clientName = claim.clientName || project?.client || "—";
  const clientAddress = claim.clientAddress || project?.companyAddress || "—";
  const contact = claim.contactPerson || project?.contactPerson || "—";
  const isInvoice = isInternalInvoice(claim);

  const initial = () => ({
    claimNo: claim.claimNo != null ? String(claim.claimNo) : "",
    claimDate: claim.submittedDate && claim.submittedDate !== "—" ? claim.submittedDate : "",
    totalClaim: claim.totalClaim != null ? String(claim.totalClaim) : "",
    certifiedAmount: claim.certifiedAmount != null ? String(claim.certifiedAmount) : "",
    certifiedDate: claim.certifiedDate ?? "",
    paidDate: claim.paidDate ?? "",
    remarks: claim.remarks ?? "",
    gst: claim.gst != null ? String(claim.gst) : "",
    totalAmount: claim.totalAmount != null ? String(claim.totalAmount) : "",
    poRef: claim.poRef ?? "",
    woRef: claim.woRef ?? "",
    doRef: claim.doRef ?? "",
    paymentTerms: claim.paymentTerms ?? "",
    clientAddress: claim.clientAddress ?? "",
    contactPerson: claim.contactPerson ?? "",
    contactNumber: claim.contactNumber ?? "",
  });
  const [draft, setDraft] = useState(initial);

  const cancel = () => {
    setDraft(initial());
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateClaimFields(claim.id, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const lbl = "text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block";

  const certified = claim.certifiedAmount;
  const shortfall = certified != null ? claim.amount - certified : null;

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {isInvoice ? "Conplus Invoice" : "Progress Claim"}
            </span>
          </div>
          <Field label="Client Name" value={clientName} />
          <Field label="Project Code" value={claim.projectCode || "—"} />
          <div className="col-span-2"><Field label="Client Address" value={clientAddress} /></div>
          <Field label="Contact" value={contact} />
          <Field label="Contact No" value={claim.contactNumber || project?.contactPerson ? claim.contactNumber || "—" : "—"} />
          <Field label="Project" value={claim.projectName} />
          <Field label="Claim No" value={claim.claimNo != null ? String(claim.claimNo) : "—"} />
          <Field label="Total Claim" value={claim.totalClaim != null ? formatCurrency(claim.totalClaim) : "—"} />
          <Field label="Claim Amount" value={formatCurrency(claim.amount)} />
          <Field label="Certified Amount" value={certified != null ? formatCurrency(certified) : "—"} />
          <Field label="Submitted" value={claim.submittedDate} />
          <Field label="Certified" value={claim.certifiedDate ?? "—"} />
          <Field label="Paid" value={claim.paidDate ?? "—"} />
          <Field label="Amount before GST" value={formatCurrency(claim.amount)} />
          <Field label="GST (9%)" value={claim.gst != null ? formatCurrency(claim.gst) : "—"} />
          <Field label="Total Amount" value={claim.totalAmount != null ? formatCurrency(claim.totalAmount) : formatCurrency(claim.amount + (claim.gst ?? 0))} />
          <Field label="Payment Terms" value={claim.paymentTerms || "—"} />
          <Field label="PO No" value={claim.poRef || "—"} />
          <Field label="WO No" value={claim.woRef || "—"} />
          <Field label="DO No" value={claim.doRef || "—"} />
          <div className="col-span-2">
            <Field label="Description" value={claim.description || "—"} />
          </div>
          {claim.remarks && (
            <div className="col-span-2">
              <Field label="Remarks" value={claim.remarks} />
            </div>
          )}
        </div>
        {shortfall != null && shortfall > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-card-foreground">
            Certified {formatCurrency(certified!)} against {formatCurrency(claim.amount)} claimed —
            <b> {formatCurrency(shortfall)} short.</b>
          </div>
        )}
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
        >
          Edit
        </button>
        <ActivityLog recordId={claim.id} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project" value={claim.projectName} />
        <div>
          <label className={lbl}>Claim No</label>
          <input className={inp} inputMode="numeric" value={draft.claimNo} onChange={(e) => setDraft({ ...draft, claimNo: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Claim Date</label>
          <input type="date" className={inp} value={draft.claimDate} onChange={(e) => setDraft({ ...draft, claimDate: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Total Claim (before retention)</label>
          <input className={inp} inputMode="decimal" value={draft.totalClaim} onChange={(e) => setDraft({ ...draft, totalClaim: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Certified Amount</label>
          <input className={inp} inputMode="decimal" placeholder="Can be less than claimed" value={draft.certifiedAmount} onChange={(e) => setDraft({ ...draft, certifiedAmount: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Certified Date</label>
          <input type="date" className={inp} value={draft.certifiedDate} onChange={(e) => setDraft({ ...draft, certifiedDate: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Paid Date</label>
          <input type="date" className={inp} value={draft.paidDate} onChange={(e) => setDraft({ ...draft, paidDate: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>GST (9%)</label>
          <input className={inp} inputMode="decimal" value={draft.gst} onChange={(e) => setDraft({ ...draft, gst: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Total Amount</label>
          <input className={inp} inputMode="decimal" value={draft.totalAmount} onChange={(e) => setDraft({ ...draft, totalAmount: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>PO No</label>
          <input className={inp} value={draft.poRef} onChange={(e) => setDraft({ ...draft, poRef: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>WO No</label>
          <input className={inp} value={draft.woRef} onChange={(e) => setDraft({ ...draft, woRef: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>DO No</label>
          <input className={inp} value={draft.doRef} onChange={(e) => setDraft({ ...draft, doRef: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Payment Terms</label>
          <input className={inp} value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Client Address</label>
          <input className={inp} value={draft.clientAddress} onChange={(e) => setDraft({ ...draft, clientAddress: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Contact Person</label>
          <input className={inp} value={draft.contactPerson} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Contact No</label>
          <input className={inp} value={draft.contactNumber} onChange={(e) => setDraft({ ...draft, contactNumber: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Remarks</label>
          <input className={inp} value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={cancel}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ClaimRows({
  rows,
  onOpen,
  empty,
}: {
  rows: Claim[];
  onOpen: (c: Claim) => void;
  empty: string;
}) {
  return (
    <div className="divide-y divide-border">
      {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>}
      {rows.map((c) => (
        <div
          key={c.id}
          onClick={() => onOpen(c)}
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-secondary/40 transition-colors"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium text-primary">
              {c.claimNumber}
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {isInternalInvoice(c) ? "Conplus Invoice" : "Progress Claim"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground truncate">{c.projectName}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-semibold text-card-foreground">{formatCurrency(c.amount)}</span>
            <StatusBadge status={c.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DateRange({
  from,
  to,
  onFrom,
  onTo,
  label,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
        title={`${label} from`}
        className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <span className="text-[10px] text-muted-foreground">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onTo(e.target.value)}
        title={`${label} to`}
        className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {(from || to) && (
        <button
          onClick={() => { onFrom(""); onTo(""); }}
          title="Clear dates"
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function ClearChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Clear filter"
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/20 transition-colors"
    >
      Filtered <X className="h-3 w-3" />
    </button>
  );
}

function PipelineCell({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={active ? "Showing this status — click to clear" : `Show only ${label}`}
      className={`p-4 text-center transition-colors ${
        active ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : "hover:bg-secondary/50"
      }`}
    >
      <p className={`text-2xl font-heading font-bold ${active ? "text-primary" : "text-card-foreground"}`}>{count}</p>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-1">{label}</p>
    </button>
  );
}

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

function Kpi({ label, value, sub, onClick, active }: {
  label: string; value: string | number; sub?: string; onClick?: () => void; active?: boolean;
}) {
  const Tag = (onClick ? "button" : "div") as "button";
  return (
    <Tag
      onClick={onClick}
      title={onClick ? `View ${label.toLowerCase()}` : undefined}
      className={`rounded-xl border bg-card p-4 shadow-sm w-full text-left transition-colors ${
        active ? "border-primary/50 bg-primary/5" : "border-border"
      } ${onClick ? "hover:border-primary/40 hover:bg-secondary/40 cursor-pointer" : ""}`}
    >
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-heading font-bold text-card-foreground mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </Tag>
  );
}

export default function LiveViewPage() {
  const { projects, inventory, purchaseOrders, invoices, claims, alerts, worksOrders, lastSyncedAt, isLoading } = useAppData();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [poSearch, setPoSearch] = useState("");
  const [woSearch, setWoSearch] = useState("");
  const [poStatus, setPoStatus] = useState<POStatus | "all">("all");
  const [woStatus, setWoStatus] = useState<WOStatus | "all">("all");
  const [claimFilter, setClaimFilter] = useState<"all" | "outstanding">("all");
  const [invFilter, setInvFilter] = useState<"all" | "open">("all");
  const [stockOnly, setStockOnly] = useState(false);
  const [poFrom, setPoFrom] = useState("");
  const [poTo, setPoTo] = useState("");
  const [claimFrom, setClaimFrom] = useState("");
  const [claimTo, setClaimTo] = useState("");
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
      : inventory.filter((i) =>
          stockOnly ? i.status === "critical" || i.status === "out" : (i.status === "low" || i.status === "critical") && i.totalQty > 0,
        );
    const filtering = stockSearch !== "" || stockOnly;
    return [...base].sort((a, b) => a.totalQty - b.totalQty).slice(0, filtering ? 40 : 8);
  }, [inventory, stockSearch, stockOnly]);

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
    const withStatus = woStatus === "all" ? base : base.filter((w) => w.status === woStatus);
    const filtering = woSearch !== "" || woStatus !== "all";
    return withStatus.slice(0, filtering ? 40 : 6);
  }, [worksOrders, woSearch, woStatus]);

  const recentPOs = useMemo(() => {
    let base = purchaseOrders;
    if (poStatus !== "all") base = base.filter((po) => po.status === poStatus);
    if (poSearch)
      base = base.filter(
        (po) => has(po.poNumber, poSearch) || has(po.supplier, poSearch) || has(po.project, poSearch) || has(po.projectCode, poSearch),
      );
    if (poFrom || poTo) base = base.filter((po) => inRange(po.createdDate, poFrom, poTo));
    const filtering = poSearch !== "" || poStatus !== "all" || poFrom !== "" || poTo !== "";
    return base.slice(0, filtering ? 40 : 6);
  }, [purchaseOrders, poSearch, poStatus, poFrom, poTo]);

  const recentClaims = useMemo(() => {
    const base = claimSearch
      ? claims.filter((c) => has(c.claimNumber, claimSearch) || has(c.projectName, claimSearch) || has(c.description, claimSearch))
      : claims;
    let scoped = claimFilter === "outstanding" ? base.filter((c) => c.status !== "paid") : base;
    if (claimFrom || claimTo) scoped = scoped.filter((c) => inRange(c.submittedDate, claimFrom, claimTo));
    const filtering = claimSearch !== "" || claimFilter !== "all" || claimFrom !== "" || claimTo !== "";
    return scoped.slice(0, filtering ? 40 : 5);
  }, [claims, claimSearch, claimFilter, claimFrom, claimTo]);

  const progressClaims = useMemo(() => recentClaims.filter((c) => !isInternalInvoice(c)), [recentClaims]);
  const conplusInvoices = useMemo(() => recentClaims.filter(isInternalInvoice), [recentClaims]);

  const shownInvoices = useMemo(() => {
    const base = invSearch
      ? invoices.filter((i) => has(i.invoiceNumber, invSearch) || has(i.vendor, invSearch) || has(i.poMatch, invSearch))
      : invoices;
    const scoped = invFilter === "open" ? base.filter((i) => i.status !== "paid" && i.status !== "rejected") : base;
    const filtering = invSearch !== "" || invFilter !== "all";
    return scoped.slice(0, filtering ? 40 : 8);
  }, [invoices, invSearch, invFilter]);

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
          <Kpi label="POs Awaiting Action" value={pendingPOs.length} sub={`${purchaseOrders.length} total`} active={poStatus === "pending"} onClick={() => { setPoStatus("pending"); }} />
          <Kpi label="Stock Issues" value={stockIssues} sub="critical / out" active={stockOnly} onClick={() => { setStockOnly(!stockOnly); }} />
          <Kpi label="Outstanding Claims" value={formatCurrency(outstandingClaims)} sub={`${claims.length} claims`} active={claimFilter === "outstanding"} onClick={() => { setClaimFilter(claimFilter === "outstanding" ? "all" : "outstanding"); }} />
          <Kpi label="Open Invoices" value={unpaidInvoices} sub={`${invoices.length} on record`} active={invFilter === "open"} onClick={() => { setInvFilter(invFilter === "open" ? "all" : "open"); }} />
        </div>

        {/* Works Orders — what each job needs, before anything is ordered */}
        <Section
          title="Works Orders"
          icon={<ClipboardList className="h-4 w-4" />}
          action={<div className="flex items-center gap-1.5"><SearchBox value={woSearch} onChange={setWoSearch} placeholder="Search WO, project, site..." /><ExportMenu rows={woFiltered} columns={COLS.works} title="Works Orders" /></div>}
        >
          <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-border border-b border-border">
            <PipelineCell
              label="All"
              count={worksOrders.length}
              active={woStatus === "all"}
              onClick={() => setWoStatus("all")}
            />
            {WO_PIPELINE.map((col) => (
              <PipelineCell
                key={col.status}
                label={col.label}
                count={worksOrders.filter((w) => w.status === col.status).length}
                active={woStatus === col.status}
                onClick={() => setWoStatus(woStatus === col.status ? "all" : col.status)}
              />
            ))}
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
                        {(wo.siteContact || wo.issueDate) && (
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                            {wo.siteContact && (
                              <span>Site contact: <span className="text-card-foreground">{wo.siteContact}{wo.siteContactNumber ? ` (${wo.siteContactNumber})` : ""}</span></span>
                            )}
                            {wo.issueDate && (
                              <span>Issued: <span className="text-card-foreground">{wo.issueDate}</span></span>
                            )}
                          </div>
                        )}
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); exportWOToExcel(wo); }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5 text-success" /> Excel
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); printWO(wo); }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
                          >
                            <Printer className="h-3.5 w-3.5" /> Print works order
                          </button>
                        </div>
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
                                {area.lines.map((l) => {
                                  const child = !!l.parentLineId;
                                  const qty = l.isMixComponent
                                    ? null
                                    : l.orderQty != null && l.orderQty !== l.requiredQty
                                      ? `${l.orderQty} ${l.qtyUnit} (req ${l.requiredQty ?? "—"})`
                                      : `${l.requiredQty ?? "—"} ${l.qtyUnit}`;
                                  return (
                                  <tr key={l.id} className={child ? "bg-secondary/20" : undefined}>
                                    <td className={`py-1.5 text-card-foreground ${child ? "pl-6 pr-3 text-xs text-muted-foreground" : "px-3"}`}>{child ? "↳ " : ""}{l.description}</td>
                                    <td className="px-2 py-1.5 text-xs text-muted-foreground text-right whitespace-nowrap">
                                      {l.dosage != null ? `${l.dosage} ${l.dosageUnit}` : ""}
                                    </td>
                                    <td className="px-2 py-1.5 text-xs text-muted-foreground text-right whitespace-nowrap">
                                      {l.packingSize != null ? `${l.packingSize} ${l.packingUnit}` : ""}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-semibold text-card-foreground whitespace-nowrap">
                                      {l.isMixComponent ? <span className="text-xs font-normal text-muted-foreground">mix</span> : qty}
                                    </td>
                                  </tr>
                                  );
                                })}
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
          action={<div className="flex flex-wrap items-center gap-1.5"><DateRange from={poFrom} to={poTo} onFrom={setPoFrom} onTo={setPoTo} label="PO date" /><SearchBox value={poSearch} onChange={setPoSearch} placeholder="Search PO, supplier..." /><ExportMenu rows={recentPOs} columns={COLS.pos} title="Purchase Orders" /></div>}
        >
          <div className="grid grid-cols-4 md:grid-cols-7 divide-x divide-border border-b border-border">
            <PipelineCell
              label="All"
              count={purchaseOrders.length}
              active={poStatus === "all"}
              onClick={() => setPoStatus("all")}
            />
            {PIPELINE.map((col) => (
              <PipelineCell
                key={col.status}
                label={col.label}
                count={purchaseOrders.filter((po) => po.status === col.status).length}
                active={poStatus === col.status}
                onClick={() => setPoStatus(poStatus === col.status ? "all" : col.status)}
              />
            ))}
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
            action={<div className="flex items-center gap-1.5">{stockOnly && <ClearChip onClick={() => setStockOnly(false)} />}<SearchBox value={stockSearch} onChange={setStockSearch} placeholder="Search all stock..." /></div>}
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

          {/* Progress Claims — contract work, claimed monthly, retention held */}
          <Section
            title="Progress Claims"
            icon={<DollarSign className="h-4 w-4" />}
            action={<div className="flex flex-wrap items-center gap-1.5">{claimFilter === "outstanding" && <ClearChip onClick={() => setClaimFilter("all")} />}<DateRange from={claimFrom} to={claimTo} onFrom={setClaimFrom} onTo={setClaimTo} label="Claim date" /><SearchBox value={claimSearch} onChange={setClaimSearch} placeholder="Search claims..." /><ExportMenu rows={progressClaims} columns={COLS.claims} title="Progress Claims" /></div>}
          >
            <ClaimRows rows={progressClaims} onOpen={(c) => setDetail({ type: "claim", item: c })} empty="No progress claims on record yet." />
          </Section>

          {/* Conplus Invoices — small jobs billed once, no retention */}
          <Section
            title="Conplus Invoices"
            icon={<FileText className="h-4 w-4" />}
            action={<ExportMenu rows={conplusInvoices} columns={COLS.claims} title="Conplus Invoices" />}
          >
            <ClaimRows rows={conplusInvoices} onOpen={(c) => setDetail({ type: "claim", item: c })} empty="No Conplus invoices on record yet." />
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
          action={<div className="flex items-center gap-1.5">{invFilter === "open" && <ClearChip onClick={() => setInvFilter("all")} />}<SearchBox value={invSearch} onChange={setInvSearch} placeholder="Search invoices..." /><ExportMenu rows={shownInvoices} columns={COLS.invoices} title="Supplier Invoices" /></div>}
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
