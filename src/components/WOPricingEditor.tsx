import { useEffect, useMemo, useState } from "react";
import { Save, X, Printer, Download, FileEdit, Plus, Layers, AlertTriangle } from "lucide-react";
import { useAppData } from "@/data/AppDataContext";
import { formatCurrency, type WorksOrder, type WorksOrderArea } from "@/data/sampleData";
import { qtyUnitLabel, printWO } from "@/lib/woDocument";
import { exportWOTemplateExcel } from "@/lib/woExcelExport";
import { downloadWOAmendmentSheet } from "@/lib/woAmendmentSheet";
import type { WOLineEdit, NewWOLine } from "@/data/db";
import { cn } from "@/lib/utils";

const GST_RATE = 0.09;

type Draft = Record<string, { orderQty: string; unitPrice: string }>;

const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Inline "add material" form for a scope area. LOA-generated works orders arrive
 * as skeletons (areas carry m² but no material lines); this lets the user add a
 * priced material, auto-computing order qty = ceil(area m² × dosage ÷ pack size).
 */
function AddMaterial({ area, onAdd }: { area: WorksOrderArea; onAdd: (f: NewWOLine) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    description: "",
    colour: "",
    dosage: "",
    dosageUnit: "kg/m²",
    packingSize: "",
    packingUnit: "kg",
    unitPrice: "",
    orderQty: "",
  });

  const dosage = numOrNull(f.dosage);
  const pack = numOrNull(f.packingSize);
  const suggested =
    area.areaSqm != null && dosage != null && pack != null && pack > 0
      ? Math.ceil((area.areaSqm * dosage) / pack)
      : null;
  const orderQty = f.orderQty.trim() !== "" ? numOrNull(f.orderQty) : suggested;

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const reset = () =>
    setF({ description: "", colour: "", dosage: "", dosageUnit: "kg/m²", packingSize: "", packingUnit: "kg", unitPrice: "", orderQty: "" });

  const submit = async () => {
    if (!f.description.trim()) return;
    setBusy(true);
    try {
      await onAdd({
        woId: "", // filled by caller
        areaId: area.id,
        description: f.description.trim(),
        colour: f.colour.trim() || undefined,
        dosage,
        dosageUnit: f.dosageUnit.trim(),
        packingSize: pack,
        packingUnit: f.packingUnit.trim(),
        orderQty,
        unitPrice: numOrNull(f.unitPrice),
      });
      reset();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="border-t border-border/60 px-3 py-2">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add material to {area.areaName}
        </button>
      </div>
    );
  }

  const cell = "rounded border border-border bg-background px-2 py-1 text-sm";
  return (
    <div className="border-t border-border/60 bg-muted/30 px-3 py-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-2">
          <span className="text-[11px] font-medium text-muted-foreground">Description</span>
          <input className={cell} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Epoxy primer coat" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Colour</span>
          <input className={cell} value={f.colour} onChange={(e) => set("colour", e.target.value)} placeholder="RAL / colour" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Unit price (S$)</span>
          <input type="number" min="0" step="0.01" className={cn(cell, "text-right")} value={f.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} placeholder="0.00" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Dosage</span>
          <div className="flex gap-1">
            <input type="number" min="0" step="0.001" className={cn(cell, "w-full text-right")} value={f.dosage} onChange={(e) => set("dosage", e.target.value)} placeholder="0" />
            <input className={cn(cell, "w-20")} value={f.dosageUnit} onChange={(e) => set("dosageUnit", e.target.value)} />
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Packing size</span>
          <div className="flex gap-1">
            <input type="number" min="0" step="0.001" className={cn(cell, "w-full text-right")} value={f.packingSize} onChange={(e) => set("packingSize", e.target.value)} placeholder="0" />
            <input className={cn(cell, "w-20")} value={f.packingUnit} onChange={(e) => set("packingUnit", e.target.value)} />
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Order qty {suggested != null && f.orderQty.trim() === "" && <span className="text-primary">(auto {suggested})</span>}
          </span>
          <input
            type="number"
            min="0"
            className={cn(cell, "text-right")}
            value={f.orderQty}
            onChange={(e) => set("orderQty", e.target.value)}
            placeholder={suggested != null ? String(suggested) : "0"}
          />
        </label>
      </div>
      {area.areaSqm != null && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Suggested qty = ⌈{area.areaSqm.toLocaleString()} m² × dosage ÷ pack size⌉. Override above if needed.
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={busy || !f.description.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {busy ? "Adding…" : "Add material"}
        </button>
        <button
          onClick={() => { reset(); setOpen(false); }}
          disabled={busy}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Spec 1.4 — editable web view. Lets the user edit order_qty and unit_price per
 * line, watch line / section / grand totals recompute live, then save back to
 * works_order_lines (only those two columns). Read-only once the WO is completed
 * or pending invoice.
 */
export default function WOPricingEditor({ wo, onClose }: { wo: WorksOrder; onClose: () => void }) {
  const { updateWOLines, createWOLine } = useAppData();
  const readOnly = wo.status === "completed" || wo.status === "pending_invoice";

  // Editable lines only (mix components are shown but not priced/edited).
  const editableLines = useMemo(
    () => wo.areas.flatMap((a) => a.lines.filter((l) => !l.isMixComponent)),
    [wo]
  );

  const initial: Draft = useMemo(() => {
    const d: Draft = {};
    for (const l of editableLines) {
      d[l.id] = {
        orderQty: l.orderQty != null ? String(l.orderQty) : "",
        unitPrice: l.unitPrice != null ? String(l.unitPrice) : "",
      };
    }
    return d;
  }, [editableLines]);

  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  // Merge in any lines that appear after mount (e.g. a material just added to an
  // area) without clobbering in-progress edits on existing rows.
  useEffect(() => {
    setDraft((d) => {
      let changed = false;
      const next = { ...d };
      for (const l of editableLines) {
        if (!next[l.id]) {
          next[l.id] = {
            orderQty: l.orderQty != null ? String(l.orderQty) : "",
            unitPrice: l.unitPrice != null ? String(l.unitPrice) : "",
          };
          changed = true;
        }
      }
      return changed ? next : d;
    });
  }, [editableLines]);

  const patch = (id: string, field: "orderQty" | "unitPrice", value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));

  const lineTotal = (id: string): number => {
    const row = draft[id];
    if (!row) return 0;
    const q = numOrNull(row.orderQty);
    const p = numOrNull(row.unitPrice);
    return q != null && p != null ? q * p : 0;
  };

  const dirty = useMemo(
    () =>
      editableLines.some((l) => {
        const row = draft[l.id] ?? initial[l.id];
        return row.orderQty !== initial[l.id].orderQty || row.unitPrice !== initial[l.id].unitPrice;
      }),
    [draft, initial, editableLines]
  );

  const modifiedFromAward = useMemo(
    () =>
      editableLines.some((l) => {
        const q = numOrNull((draft[l.id] ?? initial[l.id]).orderQty);
        return l.requiredQty != null && q != null && q !== l.requiredQty;
      }),
    [draft, initial, editableLines]
  );

  const grand = useMemo(
    () => editableLines.reduce((s, l) => s + lineTotal(l.id), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, editableLines]
  );
  const gst = grand * GST_RATE;

  const discard = () => {
    setDraft(initial);
    setFailedIds(new Set());
  };

  const save = async () => {
    setSaving(true);
    setFailedIds(new Set());
    const edits: WOLineEdit[] = editableLines
      .filter((l) => {
        const row = draft[l.id] ?? initial[l.id];
        return row.orderQty !== initial[l.id].orderQty || row.unitPrice !== initial[l.id].unitPrice;
      })
      .map((l) => {
        const row = draft[l.id] ?? initial[l.id];
        return { id: l.id, orderQty: numOrNull(row.orderQty), unitPrice: numOrNull(row.unitPrice) };
      });
    try {
      if (edits.length) await updateWOLines(edits);
      onClose();
    } catch (e) {
      // Highlight the failing row (message ends with the offending line id).
      const msg = e instanceof Error ? e.message : "";
      const failed = new Set<string>();
      for (const l of editableLines) if (msg.includes(l.id)) failed.add(l.id);
      setFailedIds(failed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {wo.woNumber} — {wo.remarks || "Coating system"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Grouped by area. Type quantity — cost auto-totals per line and per area.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {modifiedFromAward && (
            <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              <AlertTriangle className="h-3 w-3" /> Modified from award
            </span>
          )}
          {readOnly && (
            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Read-only ({wo.status.replace(/_/g, " ")})
            </span>
          )}
        </div>
      </div>

      {wo.areas.map((area) => {
        const areaLines = area.lines;
        const areaTotal = areaLines
          .filter((l) => !l.isMixComponent)
          .reduce((s, l) => s + lineTotal(l.id), 0);
        return (
          <div key={area.id} className="mb-3 overflow-hidden rounded-md border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{area.areaName}</span>
                {area.areaSqm != null && (
                  <span className="text-xs text-muted-foreground">{area.areaSqm.toLocaleString()} m²</span>
                )}
              </div>
              <span className="text-sm font-semibold">{formatCurrency(areaTotal)}</span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-1.5 text-left font-medium">Description</th>
                  <th className="px-2 py-1.5 text-right font-medium">Dosage</th>
                  <th className="px-2 py-1.5 text-right font-medium">Pack</th>
                  <th className="px-2 py-1.5 text-right font-medium">Unit Price</th>
                  <th className="px-2 py-1.5 text-right font-medium">Order Qty</th>
                  <th className="px-3 py-1.5 text-right font-medium">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {areaLines.map((l) => {
                  if (l.isMixComponent) {
                    return (
                      <tr key={l.id} className="border-t border-border/60 text-muted-foreground">
                        <td className="px-3 py-1.5 pl-6 text-xs">↳ {l.description}</td>
                        <td className="px-2 py-1.5 text-right text-xs">
                          {l.dosage != null ? `${l.dosage} ${l.dosageUnit}` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-xs">
                          {l.packingSize != null ? `${l.packingSize} ${l.packingUnit}` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-xs">mix</td>
                        <td className="px-2 py-1.5 text-right text-xs">—</td>
                        <td className="px-3 py-1.5 text-right text-xs">—</td>
                      </tr>
                    );
                  }
                  const row = draft[l.id] ?? { orderQty: "", unitPrice: "" };
                  const q = numOrNull(row.orderQty);
                  const unit = qtyUnitLabel(l, q);
                  const failed = failedIds.has(l.id);
                  const reqDiffers = l.requiredQty != null && q != null && q !== l.requiredQty;
                  return (
                    <tr
                      key={l.id}
                      className={cn("border-t border-border/60", failed && "bg-destructive/10")}
                    >
                      <td className="px-3 py-1.5">{l.description}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {l.dosage != null ? `${l.dosage} ${l.dosageUnit}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {l.packingSize != null ? `${l.packingSize} ${l.packingUnit}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          disabled={readOnly}
                          value={row.unitPrice}
                          onChange={(e) => patch(l.id, "unitPrice", e.target.value)}
                          className="w-24 rounded border border-border bg-background px-2 py-1 text-right text-sm disabled:opacity-60"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            disabled={readOnly}
                            value={row.orderQty}
                            onChange={(e) => patch(l.id, "orderQty", e.target.value)}
                            className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-sm disabled:opacity-60"
                            placeholder="0"
                          />
                          <span className="w-8 text-left text-xs text-muted-foreground">{unit}</span>
                        </div>
                        {reqDiffers && (
                          <span className="block text-[10px] text-muted-foreground">req {l.requiredQty}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                        {formatCurrency(lineTotal(l.id))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!readOnly && (
              <AddMaterial area={area} onAdd={(f) => createWOLine({ ...f, woId: wo.id })} />
            )}
          </div>
        );
      })}

      {/* Grand totals */}
      <div className="ml-auto mt-2 w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Value of work</span>
          <span className="font-medium tabular-nums">{formatCurrency(grand)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">GST (9%)</span>
          <span className="font-medium tabular-nums">{formatCurrency(gst)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
          <span>Total incl. GST</span>
          <span className="tabular-nums">{formatCurrency(grand + gst)}</span>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadWOAmendmentSheet(wo)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <FileEdit className="h-3.5 w-3.5" /> Download editable sheet
          </button>
          <button
            onClick={() => exportWOTemplateExcel(wo)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> Export Excel
          </button>
          <button
            onClick={() => printWO(wo)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={discard}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Discard
          </button>
          <button
            onClick={save}
            disabled={readOnly || !dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
