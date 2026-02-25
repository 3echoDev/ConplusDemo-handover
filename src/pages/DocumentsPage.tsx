import { useState } from "react";
import { Upload, Search, Grid3X3, List, FileText, CheckCircle2, Clock, AlertCircle, Eye } from "lucide-react";
import { StatusBadge } from "@/components/shared/UIComponents";
import { invoices, formatCurrency, type InvoiceStatus } from "@/data/sampleData";
import { cn } from "@/lib/utils";

export default function DocumentsPage() {
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const filtered = invoices.filter((inv) =>
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    inv.vendor.toLowerCase().includes(search.toLowerCase())
  );

  const selected = invoices.find((i) => i.id === selectedInvoice);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">ASSET — Invoice Management</p>
        </div>
      </div>

      {/* Upload zone */}
      <div className="rounded-xl border-2 border-dashed border-border bg-card p-8 text-center hover:border-primary/40 transition-colors cursor-pointer">
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-card-foreground">Drag & drop invoices here, or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG up to 10MB</p>
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
                      <td className="p-4 text-right font-medium text-card-foreground">{formatCurrency(inv.amount)}</td>
                      <td className="p-4 text-muted-foreground text-xs">{inv.date}</td>
                      <td className="p-4">{inv.poMatch ? <span className="text-xs font-medium text-primary">{inv.poMatch}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                      <td className="p-4"><StatusBadge status={inv.status} /></td>
                      <td className="p-4 text-center">
                        <button className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"><Eye className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map((inv) => (
                <div key={inv.id} onClick={() => setSelectedInvoice(inv.id)} className={cn("rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all cursor-pointer", selectedInvoice === inv.id && "ring-2 ring-primary")}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                    <StatusBadge status={inv.status} />
                  </div>
                  <p className="text-sm font-semibold text-card-foreground">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{inv.vendor}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-lg font-bold font-heading text-card-foreground">{formatCurrency(inv.amount)}</span>
                    <span className="text-xs text-muted-foreground">{inv.date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OCR Detail Panel */}
        {selected && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-heading font-semibold text-card-foreground">OCR Extracted Data</h3>
              <button onClick={() => setSelectedInvoice(null)} className="text-xs text-muted-foreground hover:text-foreground">✕ Close</button>
            </div>

            {/* Progress workflow */}
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              {["Received", "Pending Review", "Approved"].map((step, i) => {
                const statusMap: InvoiceStatus[] = ["received", "pending-review", "approved"];
                const currentIdx = statusMap.indexOf(selected.status);
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
              {/* Confidence */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">OCR Confidence:</span>
                <span className={cn("text-xs font-bold", selected.confidence >= 90 ? "text-success" : selected.confidence >= 75 ? "text-warning" : "text-destructive")}>{selected.confidence}%</span>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Vendor", value: selected.vendor, conf: 98 },
                  { label: "Invoice #", value: selected.invoiceNumber, conf: selected.confidence },
                  { label: "Date", value: selected.date, conf: 95 },
                  { label: "Amount", value: formatCurrency(selected.amount), conf: selected.confidence },
                  { label: "PO Reference", value: selected.poMatch || "N/A", conf: selected.poMatch ? 92 : 0 },
                ].map((f) => (
                  <div key={f.label} className="rounded-lg border border-border p-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{f.label}</p>
                    <p className="text-sm font-medium text-card-foreground">{f.value}</p>
                    {f.conf > 0 && <p className={cn("text-[10px] mt-1", f.conf >= 90 ? "text-success" : "text-warning")}>{f.conf}% confidence</p>}
                  </div>
                ))}
              </div>

              {/* Line items */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Line Items</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/50 text-muted-foreground">
                        <th className="text-left p-2 font-medium">Description</th>
                        <th className="text-right p-2 font-medium">Qty</th>
                        <th className="text-right p-2 font-medium">Unit Price</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lineItems.map((li, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 text-card-foreground">{li.description}</td>
                          <td className="p-2 text-right text-muted-foreground">{li.qty}</td>
                          <td className="p-2 text-right text-muted-foreground">{formatCurrency(li.unitPrice)}</td>
                          <td className="p-2 text-right font-medium text-card-foreground">{formatCurrency(li.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button className="flex-1 rounded-lg bg-success px-4 py-2 text-sm font-medium text-success-foreground hover:bg-success/90 transition-colors">Approve</button>
                <button className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">Edit Fields</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
