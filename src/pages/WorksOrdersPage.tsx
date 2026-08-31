import { useMemo, useState } from "react";
import { Plus, Search, ChevronRight, ClipboardList, Layers, Calculator, Printer, Download, Pencil } from "lucide-react";
import { printWO } from "@/lib/woDocument";
import { exportWOTemplateExcel } from "@/lib/woExcelExport";
import ActivityLog from "@/components/ActivityLog";
import WOPricingEditor from "@/components/WOPricingEditor";
import { useAppData } from "@/data/AppDataContext";
import { StatusBadge } from "@/components/shared/UIComponents";
import CreateWODialog from "@/components/CreateWODialog";
import type { WOStatus } from "@/data/sampleData";
import { cn } from "@/lib/utils";

const STATUSES: WOStatus[] = [
  "draft",
  "created",
  "confirmed",
  "pending_completion",
  "completed",
  "pending_invoice",
  "cancelled",
];

const pretty = (s: string) => s.replace(/_/g, " ");

export default function WorksOrdersPage() {
  const { worksOrders, updateWOStatus, isLoading } = useAppData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WOStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return worksOrders.filter((w) => {
      if (status !== "all" && w.status !== status) return false;
      if (!q) return true;
      return (
        w.woNumber.toLowerCase().includes(q) ||
        w.projectCode.toLowerCase().includes(q) ||
        w.clientName.toLowerCase().includes(q) ||
        w.siteAddress.toLowerCase().includes(q)
      );
    });
  }, [worksOrders, search, status]);

  const totalFor = (woId: string) => {
    const wo = worksOrders.find((w) => w.id === woId);
    if (!wo) return 0;
    return wo.areas.reduce(
      (s, a) => s + a.lines.reduce((t, l) => t + (l.requiredQty ?? 0), 0),
      0,
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Works Orders</h1>
          <p className="text-sm text-muted-foreground">
            Where a job becomes a quantity — area × dosage ÷ pack size
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New works order
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
            placeholder="Search WO number, project, client or site…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm capitalize"
          value={status}
          onChange={(e) => setStatus(e.target.value as WOStatus | "all")}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {pretty(s)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && worksOrders.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No works orders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A works order records what a job needs, before anything is ordered.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((wo) => {
            const isOpen = openId === wo.id;
            const total = totalFor(wo.id);
            return (
              <div key={wo.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <button
                  onClick={() => setOpenId(isOpen ? null : wo.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <ChevronRight
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">WO {wo.woNumber}</span>
                      <StatusBadge status={wo.status.replace(/_/g, "-")} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {wo.projectCode} · {wo.siteAddress || wo.clientName}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold">{total} sets</p>
                    <p className="text-xs text-muted-foreground">
                      {wo.areas.length} area{wo.areas.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </button>

                {isOpen && editId === wo.id && (
                  <WOPricingEditor wo={wo} onClose={() => setEditId(null)} />
                )}

                {isOpen && editId !== wo.id && (
                  <div className="border-t border-border bg-muted/20 px-4 py-4">
                    <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <Detail label="Client" value={wo.clientName} />
                      <Detail label="Job no." value={wo.jobNo} />
                      <Detail label="Sales" value={wo.sales} />
                      <Detail label="Project I/C" value={wo.projectIc} />
                      <Detail label="Quotation" value={wo.quotationRef} />
                      <Detail label="Start date" value={wo.startDate ?? ""} />
                      <Detail label="Remarks" value={wo.remarks} className="col-span-2" />
                    </div>

                    {wo.areas.map((area) => (
                      <div key={area.id} className="mb-3 overflow-hidden rounded-md border border-border bg-card">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{area.areaName}</span>
                            {area.ralColour && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {area.ralColour}
                              </span>
                            )}
                          </div>
                          {area.areaSqm != null && (
                            <span className="text-xs text-muted-foreground">
                              {area.areaSqm.toLocaleString()} m²
                            </span>
                          )}
                        </div>

                        {area.prepNote && (
                          <p className="border-b border-border px-3 py-1.5 text-xs italic text-muted-foreground">
                            {area.prepNote}
                          </p>
                        )}

                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              <th className="px-3 py-1.5 text-left font-medium">Description</th>
                              <th className="px-2 py-1.5 text-left font-medium">Colour</th>
                              <th className="px-2 py-1.5 text-right font-medium">Dosage</th>
                              <th className="px-2 py-1.5 text-right font-medium">Pack</th>
                              <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                              <th className="px-3 py-1.5 text-left font-medium">Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {area.lines.map((l) => (
                              <tr key={l.id} className="border-t border-border/60">
                                <td className="px-3 py-1.5">{l.description}</td>
                                <td className="px-2 py-1.5 text-muted-foreground">{l.colour || "—"}</td>
                                <td className="px-2 py-1.5 text-right text-muted-foreground">
                                  {l.dosage != null ? `${l.dosage} ${l.dosageUnit}` : "—"}
                                </td>
                                <td className="px-2 py-1.5 text-right text-muted-foreground">
                                  {l.packingSize != null ? `${l.packingSize} ${l.packingUnit}` : "—"}
                                </td>
                                <td className="px-2 py-1.5 text-right font-semibold">
                                  {l.isMixComponent ? (
                                    <span className="text-xs font-normal text-muted-foreground">mix</span>
                                  ) : (
                                    `${l.requiredQty ?? "—"} ${l.qtyUnit}`
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-xs text-muted-foreground">{l.remarks || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Calculator className="h-4 w-4 text-primary" />
                        <span className="text-muted-foreground">Total to order</span>
                        <span className="font-semibold">{total} sets</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditId(wo.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit qty &amp; pricing
                        </button>
                        <button
                          onClick={() => exportWOTemplateExcel(wo)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          <Download className="h-3.5 w-3.5" /> Download WO
                        </button>
                        <button
                          onClick={() => printWO(wo)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          <Printer className="h-3.5 w-3.5" /> Print
                        </button>
                        <span className="text-xs text-muted-foreground">Status</span>
                        <select
                          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm capitalize"
                          value={wo.status}
                          onChange={(e) => updateWOStatus(wo.id, e.target.value as WOStatus)}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {pretty(s)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3">
                      <ActivityLog recordId={wo.id} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateWODialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function Detail({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate">{value || "—"}</p>
    </div>
  );
}
