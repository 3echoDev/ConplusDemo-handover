import { useRef, useState } from "react";
import { Upload, Search, Grid3X3, List, FileText, CheckCircle2, Clock, Eye, Check, X } from "lucide-react";
import { StatusBadge } from "@/components/shared/UIComponents";
import { formatCurrency, type InvoiceStatus, type Claim } from "@/data/sampleData";
import { useAppData } from "@/data/AppDataContext";
import { cn } from "@/lib/utils";

function ClaimDetailDialog({ claim, onClose }: { claim: Claim; onClose: () => void }) {
  const { updateClaimStatus } = useAppData();

  const steps: { label: string; date?: string }[] = [
    { label: "Submitted", date: claim.submittedDate },
    { label: "Certified", date: claim.certifiedDate },
    { label: "Paid", date: claim.paidDate },
  ];
  const currentIdx = claim.status === "paid" ? 2 : claim.status === "certified" ? 1 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Progress Claim</p>
            <h2 className="text-lg font-heading font-semibold text-card-foreground">{claim.claimNumber}</h2>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={claim.status} />
            <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Workflow steps */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          {steps.map((step, i) => {
            const done = i <= currentIdx && claim.status !== "rejected";
            return (
              <div key={step.label} className="flex items-center gap-2 flex-1">
                <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0", done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                </div>
                <div>
                  <p className={cn("text-[10px] font-medium", done ? "text-success" : "text-muted-foreground")}>{step.label}</p>
                  {step.date && <p className="text-[10px] text-muted-foreground">{step.date}</p>}
                </div>
                {i < 2 && <div className={cn("h-0.5 flex-1", done && i < currentIdx ? "bg-success" : "bg-border")} />}
              </div>
            );
          })}
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Project</p>
              <p className="text-sm font-medium text-card-foreground">{claim.projectName}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Amount</p>
              <p className="text-sm font-medium text-card-foreground">{formatCurrency(claim.amount)}</p>
            </div>
            <div className="col-span-2 rounded-lg border border-border p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Description</p>
              <p className="text-sm font-medium text-card-foreground">{claim.description || "—"}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {(claim.status === "submitted" || claim.status === "pending") && (
              <button
                onClick={async () => { await updateClaimStatus(claim.id, "certified"); onClose(); }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-medium text-success-foreground hover:bg-success/90 transition-colors"
              >
                <Check className="h-4 w-4" /> Mark Certified
              </button>
            )}
            {claim.status === "certified" && (
              <button
                onClick={async () => { await updateClaimStatus(claim.id, "paid"); onClose(); }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Check className="h-4 w-4" /> Mark Paid
              </button>
            )}
            {(claim.status === "paid" || claim.status === "rejected") && (
              <p className="flex-1 text-center text-xs text-muted-foreground py-2">
                {claim.status === "paid" ? `Paid ${claim.paidDate ?? ""} — no further actions` : "Rejected — no further actions"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5";

function NewClaimDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { projects, createClaim } = useAppData();
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "delayed");
  const valid = projectId !== "" && Number(amount) > 0;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await createClaim(projectId, Number(amount), description);
      setProjectId(""); setAmount(""); setDescription("");
      onClose();
    } catch {
      // toast shown by context
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-heading font-semibold text-card-foreground">Submit Progress Claim</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
              <option value="">Select project...</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Claim Amount (SGD)</label>
            <input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Progress Claim #3 — Level 2 coating works" className={inputCls} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || saving}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              valid && !saving ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {saving ? "Submitting..." : "Submit Claim"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const { invoices, claims, documents, updateInvoiceStatus, updateClaimStatus, registerInvoiceUpload, isLoading } = useAppData();
  const [tab, setTab] = useState<"invoices" | "claims" | "repository">("invoices");
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [claimSearch, setClaimSearch] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = invoices.filter((inv) =>
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    inv.vendor.toLowerCase().includes(search.toLowerCase())
  );

  const filteredClaims = claims.filter((c) =>
    c.claimNumber.toLowerCase().includes(claimSearch.toLowerCase()) ||
    c.projectName.toLowerCase().includes(claimSearch.toLowerCase())
  );

  const selected = invoices.find((i) => i.id === selectedInvoice);

  const approve = (id: string) => updateInvoiceStatus(id, "approved");
  const reject = (id: string) => updateInvoiceStatus(id, "rejected");

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await registerInvoiceUpload(file);
    e.target.value = "";
  };

  const isReviewable = (status: InvoiceStatus) => status === "received" || status === "pending-review";

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">ASSET — Document Management System</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        <button onClick={() => setTab("invoices")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === "invoices" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
          Invoice Management
        </button>
        <button onClick={() => setTab("claims")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === "claims" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
          Claim Management
        </button>
        <button onClick={() => setTab("repository")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === "repository" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
          Repository
        </button>
      </div>

      {tab === "invoices" ? (
        <>
          {/* Upload zone */}
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={onFilePicked} />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) registerInvoiceUpload(file);
            }}
            className="rounded-xl border-2 border-dashed border-border bg-card p-8 text-center hover:border-primary/40 transition-colors cursor-pointer"
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-card-foreground">Drag & drop invoices here, or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Registers the invoice as "received" — data entry via review or Claude</p>
          </div>

          {/* Search & view toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoices..." className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setView("table")} className={cn("rounded-lg p-2 transition-colors", view === "table" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}><List className="h-4 w-4" /></button>
              <button onClick={() => setView("grid")} className={cn("rounded-lg p-2 transition-colors", view === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}><Grid3X3 className="h-4 w-4" /></button>
            </div>
          </div>

          <div className={cn("grid gap-6", selectedInvoice ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1")}>
            {/* Invoice list */}
            <div>
              {view === "table" ? (
                <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                        <th className="text-left p-4 font-medium">Invoice #</th>
                        <th className="text-left p-4 font-medium">Vendor</th>
                        <th className="text-right p-4 font-medium">Amount</th>
                        <th className="text-left p-4 font-medium">Date</th>
                        <th className="text-left p-4 font-medium">PO Match</th>
                        <th className="text-left p-4 font-medium">Status</th>
                        <th className="text-center p-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((inv) => (
                        <tr key={inv.id} className={cn("border-b border-border last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer", selectedInvoice === inv.id && "bg-primary/5")} onClick={() => setSelectedInvoice(inv.id)}>
                          <td className="p-4 font-medium text-primary">{inv.invoiceNumber}</td>
                          <td className="p-4 text-card-foreground">{inv.vendor}</td>
                          <td className="p-4 text-right font-medium text-card-foreground">{inv.amount > 0 ? formatCurrency(inv.amount) : <span className="text-muted-foreground" title="No amount recorded in source data">—</span>}</td>
                          <td className="p-4 text-muted-foreground text-xs">{inv.date}</td>
                          <td className="p-4">{inv.poMatch ? <span className="text-xs font-medium text-primary">{inv.poMatch}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                          <td className="p-4"><StatusBadge status={inv.status} /></td>
                          <td className="p-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              {isReviewable(inv.status) ? (
                                <>
                                  <button onClick={() => approve(inv.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-success/10 text-success hover:bg-success hover:text-success-foreground transition-colors text-xs font-medium">
                                    <Check className="h-3 w-3" /> Approve
                                  </button>
                                  <button onClick={() => reject(inv.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors text-xs font-medium">
                                    <X className="h-3 w-3" /> Reject
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => setSelectedInvoice(inv.id)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="View details">
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-muted-foreground">
                            {isLoading ? "Loading invoices from database..." : "No invoices match your search."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filtered.slice(0, 30).map((inv) => (
                    <div key={inv.id} className={cn("rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all", selectedInvoice === inv.id && "ring-2 ring-primary")}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                        <StatusBadge status={inv.status} />
                      </div>
                      <p className="text-sm font-semibold text-card-foreground">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{inv.vendor}</p>
                      <div className="flex items-center justify-between mt-3 mb-3">
                        <span className="text-lg font-bold font-heading text-card-foreground">{inv.amount > 0 ? formatCurrency(inv.amount) : "—"}</span>
                        <span className="text-xs text-muted-foreground">{inv.date}</span>
                      </div>
                      {isReviewable(inv.status) ? (
                        <div className="flex gap-2 pt-3 border-t border-border">
                          <button onClick={() => approve(inv.id)} className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-success/10 text-success hover:bg-success hover:text-success-foreground transition-colors text-xs font-medium">
                            <Check className="h-3 w-3" /> Approve
                          </button>
                          <button onClick={() => reject(inv.id)} className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors text-xs font-medium">
                            <X className="h-3 w-3" /> Reject
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setSelectedInvoice(inv.id)} className="w-full mt-3 pt-3 border-t border-border text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                          View Details
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detail Panel */}
            {selected && (
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden self-start">
                <div className="p-5 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-heading font-semibold text-card-foreground">Invoice Details</h3>
                  <button onClick={() => setSelectedInvoice(null)} className="text-xs text-muted-foreground hover:text-foreground">✕ Close</button>
                </div>

                {/* Progress workflow */}
                <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                  {["Received", "Pending Review", "Approved"].map((step, i) => {
                    const statusMap: InvoiceStatus[] = ["received", "pending-review", "approved"];
                    const currentIdx = selected.status === "paid" ? 2 : statusMap.indexOf(selected.status);
                    const done = i <= currentIdx;
                    return (
                      <div key={step} className="flex items-center gap-2 flex-1">
                        <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0", done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}>
                          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                        </div>
                        <span className={cn("text-[10px] font-medium", done ? "text-success" : "text-muted-foreground")}>{step}</span>
                        {i < 2 && <div className={cn("h-0.5 flex-1", done && i < currentIdx ? "bg-success" : "bg-border")} />}
                      </div>
                    );
                  })}
                </div>

                <div className="p-5 space-y-4">
                  {selected.confidence !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">OCR Confidence:</span>
                      <span className={cn("text-xs font-bold", selected.confidence >= 90 ? "text-success" : selected.confidence >= 75 ? "text-warning" : "text-destructive")}>{selected.confidence}%</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Vendor", value: selected.vendor },
                      { label: "Invoice #", value: selected.invoiceNumber },
                      { label: "Date", value: selected.date },
                      { label: "Amount (incl. GST)", value: selected.amount > 0 ? formatCurrency(selected.amount) : "Not recorded" },
                      { label: "PO Reference", value: selected.poMatch || "N/A" },
                      { label: "Status", value: selected.status.replace("-", " ") },
                    ].map((f) => (
                      <div key={f.label} className="rounded-lg border border-border p-3">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{f.label}</p>
                        <p className="text-sm font-medium text-card-foreground capitalize">{f.value}</p>
                      </div>
                    ))}
                  </div>

                  {selected.documentUrl && (
                    <a href={selected.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                      <Eye className="h-3.5 w-3.5" /> View uploaded file
                    </a>
                  )}

                  <div className="flex gap-2 pt-2">
                    {isReviewable(selected.status) ? (
                      <>
                        <button onClick={() => approve(selected.id)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-medium text-success-foreground hover:bg-success/90 transition-colors">
                          <Check className="h-4 w-4" /> Approve
                        </button>
                        <button onClick={() => reject(selected.id)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors">
                          <X className="h-4 w-4" /> Reject
                        </button>
                      </>
                    ) : selected.status === "approved" ? (
                      <button onClick={() => updateInvoiceStatus(selected.id, "paid")} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                        <Check className="h-4 w-4" /> Mark as Paid
                      </button>
                    ) : (
                      <div className="flex-1 text-center text-xs text-muted-foreground py-2">No actions available for {selected.status} invoices</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : tab === "claims" ? (
        /* Claim Management Section */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" value={claimSearch} onChange={(e) => setClaimSearch(e.target.value)} placeholder="Search claims..." className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button onClick={() => setShowNewClaim(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              + New Claim
            </button>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-4 font-medium">Claim #</th>
                  <th className="text-left p-4 font-medium">Project</th>
                  <th className="text-left p-4 font-medium">Description</th>
                  <th className="text-right p-4 font-medium">Amount</th>
                  <th className="text-left p-4 font-medium">Submitted</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-center p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedClaim(c.id)}
                    className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-medium text-primary">{c.claimNumber}</td>
                    <td className="p-4 text-card-foreground">{c.projectName}</td>
                    <td className="p-4 text-xs text-muted-foreground max-w-[220px] truncate">{c.description || "—"}</td>
                    <td className="p-4 text-right font-medium text-card-foreground">{formatCurrency(c.amount)}</td>
                    <td className="p-4 text-muted-foreground text-xs">{c.submittedDate}</td>
                    <td className="p-4"><StatusBadge status={c.status} /></td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {(c.status === "submitted" || c.status === "pending") && (
                          <button onClick={() => updateClaimStatus(c.id, "certified")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-success/10 text-success hover:bg-success hover:text-success-foreground transition-colors text-xs font-medium">
                            <Check className="h-3 w-3" /> Certify
                          </button>
                        )}
                        {c.status === "certified" && (
                          <button onClick={() => updateClaimStatus(c.id, "paid")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors text-xs font-medium">
                            <Check className="h-3 w-3" /> Mark Paid
                          </button>
                        )}
                        {(c.status === "paid" || c.status === "rejected") && (
                          <span className="text-xs text-muted-foreground">{c.status === "paid" ? `Paid ${c.paidDate ?? ""}` : "—"}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredClaims.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No claims yet. Click "+ New Claim" to submit one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Document Repository */
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left p-4 font-medium">Document</th>
                <th className="text-left p-4 font-medium">Type</th>
                <th className="text-left p-4 font-medium">Project</th>
                <th className="text-left p-4 font-medium">File</th>
                <th className="text-left p-4 font-medium">Added</th>
                <th className="text-center p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                  <td className="p-4">
                    <p className="font-medium text-card-foreground">{d.title}</p>
                    {d.notes && <p className="text-xs text-muted-foreground mt-0.5">{d.notes}</p>}
                  </td>
                  <td className="p-4"><StatusBadge status={d.docType} /></td>
                  <td className="p-4 text-xs text-muted-foreground">{d.projectCode}</td>
                  <td className="p-4 text-xs text-muted-foreground">{d.fileName}</td>
                  <td className="p-4 text-xs text-muted-foreground">{d.createdAt}</td>
                  <td className="p-4 text-center">
                    {d.fileUrl ? (
                      <a href={d.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors text-xs font-medium">
                        <Eye className="h-3 w-3" /> Open
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">No file</span>
                    )}
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No documents yet — create a PO or upload an invoice and it will be registered here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <NewClaimDialog open={showNewClaim} onClose={() => setShowNewClaim(false)} />
      {(() => {
        const claim = claims.find((c) => c.id === selectedClaim);
        return claim ? <ClaimDetailDialog claim={claim} onClose={() => setSelectedClaim(null)} /> : null;
      })()}
    </div>
  );
}
