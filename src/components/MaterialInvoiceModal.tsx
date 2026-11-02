// Supply-of-materials tax invoice for a Works Order (Accounts' second invoice
// format, 2 Nov 2026). Prefilled from the WO, every field editable, items editable,
// Download / Print without touching the database; Issue records it in
// internal_invoices through issue_material_invoice (same running number as the
// progress-claim invoice).
import { useEffect, useMemo, useState } from "react";
import { X, Download, Printer, FileCheck2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { WorksOrder } from "@/data/sampleData";
import { invoiceNumberFor } from "@/lib/invoiceDocument";
import {
  buildMaterialInvoiceDraft,
  computeMaterialTotals,
  lineTotal,
  spellAmountDollars,
  type MaterialInvoiceDraft,
  type MaterialInvoiceLine,
} from "@/lib/materialInvoiceDocument";
import { exportMaterialInvoiceToExcel, printMaterialInvoice } from "@/lib/materialInvoiceExcel";

const money = (n: number) => n.toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });
const numOrNull = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const actorName = () => { try { return localStorage.getItem("conplus_store_approver") || null; } catch { return null; } };

const inp = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm";
const lbl = "block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5";

export default function MaterialInvoiceModal({ wo, onClose, onIssued }: { wo: WorksOrder; onClose: () => void; onIssued?: (r: { invoice_number: string }) => void }) {
  const [draft, setDraft] = useState<MaterialInvoiceDraft | null>(null);
  const [numberTouched, setNumberTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [issued, setIssued] = useState<{ invoice_number: string; invoice_date: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [projRes, settingRes] = await Promise.all([
        wo.projectId ? supabase.from("projects").select("name, payment_terms_days, client_po").eq("id", wo.projectId).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("chase_settings").select("value").eq("key", "invoice_next_no").maybeSingle(),
      ]);
      if (cancelled) return;
      const next = settingRes.data?.value == null ? null : Number(settingRes.data.value);
      setDraft(buildMaterialInvoiceDraft({ wo, project: projRes.data ?? null, nextRunningNo: Number.isFinite(next as number) ? next : null }));
    })();
    return () => { cancelled = true; };
  }, [wo]);

  const totals = useMemo(() => (draft ? computeMaterialTotals(draft) : null), [draft]);

  const set = <K extends keyof MaterialInvoiceDraft>(k: K, v: MaterialInvoiceDraft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setDate = (iso: string) =>
    setDraft((d) => {
      if (!d) return d;
      const running = d.invoiceNumber.split("/")[0];
      return { ...d, invoiceDate: iso, invoiceNumber: numberTouched ? d.invoiceNumber : invoiceNumberFor(running ? Number(running) : null, iso) };
    });
  const setLine = (i: number, patch: Partial<MaterialInvoiceLine>) =>
    setDraft((d) => (d ? { ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : d));
  const addLine = () => setDraft((d) => (d ? { ...d, lines: [...d.lines, { description: "", unitPrice: null, qty: 1, unit: "set" }] } : d));
  const removeLine = (i: number) => setDraft((d) => (d ? { ...d, lines: d.lines.filter((_, j) => j !== i) } : d));

  const issue = async () => {
    if (!draft || !totals) return;
    const lines = draft.lines.filter((l) => l.description.trim());
    if (!lines.length) { setMsg("Add at least one item."); return; }
    if (!(totals.totalDue > 0)) { setMsg("The invoice total must be more than zero."); return; }
    if (!window.confirm(`Issue tax invoice ${draft.invoiceNumber} for ${money(totals.totalDue)} on WO ${draft.woNo}?\n\nThis records it and advances the running number.`)) return;
    setBusy(true); setMsg("");
    const { data, error } = await supabase.rpc("issue_material_invoice", {
      p_wo_id: wo.id,
      p_actor: actorName(),
      p_invoice: {
        invoice_number: draft.invoiceNumber,
        invoice_date: draft.invoiceDate,
        client_name: draft.clientName,
        client_address: draft.addressLines.join("\n"),
        attn: draft.attn,
        tel: draft.tel,
        site: draft.site,
        client_po: draft.poNo,
        wo_no: draft.woNo,
        do_no: draft.doNo,
        payment_terms: draft.paymentTerms,
        lines: lines.map((l) => ({ description: l.description, unit_price: l.unitPrice, qty: l.qty, unit: l.unit, total: lineTotal(l) })),
        amount: totals.subTotal,
        gst: totals.gst,
        total: totals.totalDue,
        description: `Supply of material — WO ${draft.woNo}${draft.jobRef ? ` (${draft.jobRef})` : ""}`,
      },
    });
    setBusy(false);
    if (error || !data?.ok) {
      const e = error?.message || data?.error || "unknown error";
      setMsg(/issue_material_invoice/.test(e) && /not find|does not exist|404/i.test(e)
        ? "Issue is not enabled on this database yet (migration 20261102_material_invoice.sql not applied). Download or Print still works."
        : `Not issued: ${e}`);
      return;
    }
    setIssued({ invoice_number: data.invoice_number, invoice_date: data.invoice_date });
    setDraft((d) => (d ? { ...d, invoiceNumber: data.invoice_number } : d));
    onIssued?.({ invoice_number: data.invoice_number });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-4xl rounded-xl border border-border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h3 className="text-base font-semibold">Tax invoice — supply of materials</h3>
            <div className="text-xs text-muted-foreground">WO {wo.woNumber} · {wo.clientName || "—"} · {wo.projectCode}</div>
          </div>
          <button className="rounded-md p-1 hover:bg-muted" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {!draft || !totals ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4 p-5">
            {issued && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Issued as <strong>{issued.invoice_number}</strong> dated {issued.invoice_date}. Download or print it below.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label><span className={lbl}>Invoice no.</span><input className={inp} value={draft.invoiceNumber} disabled={!!issued} onChange={(e) => { setNumberTouched(true); set("invoiceNumber", e.target.value); }} /></label>
              <label><span className={lbl}>Invoice date</span><input className={inp} type="date" value={draft.invoiceDate} disabled={!!issued} onChange={(e) => setDate(e.target.value)} /></label>
              <label><span className={lbl}>Payment terms</span><input className={inp} value={draft.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="COD / 30 DAYS" /></label>
              <label><span className={lbl}>Job ref (quotation no.)</span><input className={inp} value={draft.jobRef} onChange={(e) => set("jobRef", e.target.value)} /></label>
              <label><span className={lbl}>PO no. (customer)</span><input className={inp} value={draft.poNo} onChange={(e) => set("poNo", e.target.value)} /></label>
              <label><span className={lbl}>WO no.</span><input className={inp} value={draft.woNo} onChange={(e) => set("woNo", e.target.value)} /></label>
              <label><span className={lbl}>DO no.</span><input className={inp} value={draft.doNo} onChange={(e) => set("doNo", e.target.value)} placeholder="delivery order no." /></label>
              <label><span className={lbl}>Tel</span><input className={inp} value={draft.tel} onChange={(e) => set("tel", e.target.value)} /></label>
              <label className="col-span-2"><span className={lbl}>To (company)</span><input className={inp} value={draft.clientName} onChange={(e) => set("clientName", e.target.value)} /></label>
              <label className="col-span-2"><span className={lbl}>Attn</span><input className={inp} value={draft.attn} onChange={(e) => set("attn", e.target.value)} placeholder="Ms Kai Qin / Accounts Department" /></label>
              <label className="col-span-2"><span className={lbl}>Address (one line each, up to 3)</span>
                <textarea className={inp} rows={3} value={draft.addressLines.join("\n")} onChange={(e) => set("addressLines", e.target.value.split("\n").slice(0, 3))} />
              </label>
              <label className="col-span-2"><span className={lbl}>Site / Project</span><input className={inp} value={draft.site} onChange={(e) => set("site", e.target.value)} /></label>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm"><span className={lbl + " mb-0"}>Subtitle</span>
                  <input className={inp + " w-56"} value={draft.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
                </label>
                <button className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted" onClick={addLine}><Plus className="h-3.5 w-3.5" /> Add item</button>
              </div>
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground">
                  <tr><th className="w-8 py-1 text-left">S/No</th><th className="py-1 text-left">Description</th><th className="w-28 py-1 text-right">Price/unit</th><th className="w-20 py-1 text-right">Qty</th><th className="w-20 py-1 text-left">Unit</th><th className="w-28 py-1 text-right">Total</th><th className="w-8" /></tr>
                </thead>
                <tbody>
                  {draft.lines.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1 pr-2"><input className={inp} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                      <td className="py-1 pr-2"><input className={inp + " text-right"} type="number" step="0.01" value={l.unitPrice ?? ""} onChange={(e) => setLine(i, { unitPrice: numOrNull(e.target.value) })} /></td>
                      <td className="py-1 pr-2"><input className={inp + " text-right"} type="number" step="any" value={l.qty ?? ""} onChange={(e) => setLine(i, { qty: numOrNull(e.target.value) })} /></td>
                      <td className="py-1 pr-2"><input className={inp} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                      <td className="py-1 text-right tabular-nums">{money(lineTotal(l))}</td>
                      <td className="py-1 text-right"><button className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => removeLine(i)} aria-label="Remove item"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                  {!draft.lines.length && <tr><td colSpan={7} className="py-3 text-center text-xs text-muted-foreground">No items — add one.</td></tr>}
                </tbody>
              </table>
              <div className="mt-2 ml-auto w-72 space-y-1 text-sm">
                <div className="flex justify-between"><span>Sub-Total</span><span className="tabular-nums">{money(totals.subTotal)}</span></div>
                <div className="flex justify-between"><span>GST {draft.gstPct}%</span><span className="tabular-nums">{money(totals.gst)}</span></div>
                <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total Balance Due</span><span className="tabular-nums">{money(totals.totalDue)}</span></div>
                <div className="text-xs text-muted-foreground">SGD: {spellAmountDollars(totals.totalDue)}</div>
              </div>
            </div>

            {msg && <div className="text-sm text-amber-700">{msg}</div>}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => exportMaterialInvoiceToExcel(draft)}><Download className="h-4 w-4" /> Download Excel</button>
              <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => printMaterialInvoice(draft)}><Printer className="h-4 w-4" /> Print / PDF</button>
              {!issued && (
                <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50" disabled={busy} onClick={issue}>
                  <FileCheck2 className="h-4 w-4" /> {busy ? "Issuing…" : "Issue invoice"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
