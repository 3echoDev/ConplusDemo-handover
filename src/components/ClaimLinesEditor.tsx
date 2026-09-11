import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ClaimLine } from "@/data/sampleData";
import { dbSaveClaimLines, fetchClaimLines, type ClaimLineInput } from "@/data/db";

interface Props {
  claimId: string;
  lines: ClaimLine[];
  onSaved: (lines: ClaimLine[]) => void;
  onCancel: () => void;
}

type Draft = ClaimLineInput & { key: number };

const toDraft = (l: ClaimLine, key: number): Draft => ({
  key,
  section: l.section,
  quotationRef: l.quotationRef,
  pgRef: l.pgRef,
  zone: l.zone,
  description: l.description,
  unit: l.unit,
  qty: l.qty,
  rate: l.rate,
  prevQty: l.prevQty,
  currQty: l.currQty,
  remarks: l.remarks,
});

const blank = (key: number, section: "A" | "B", quotationRef: string): Draft => ({
  key, section, quotationRef, pgRef: "", zone: "", description: "", unit: "m2",
  qty: null, rate: null, prevQty: 0, currQty: 0, remarks: "",
});

const num = (v: string): number | null => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const money = (n: number) => n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClaimLinesEditor({ claimId, lines, onSaved, onCancel }: Props) {
  const [rows, setRows] = useState<Draft[]>(() =>
    lines.length ? lines.map(toDraft) : [blank(1, "A", "")],
  );
  const [saving, setSaving] = useState(false);
  const nextKey = () => Math.max(0, ...rows.map((r) => r.key)) + 1;

  const patch = (key: number, p: Partial<Draft>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = async () => {
    const kept = rows.filter((r) => r.description.trim() !== "");
    if (kept.length === 0 && !window.confirm("Save with no line items? Existing lines will be removed.")) return;
    setSaving(true);
    try {
      await dbSaveClaimLines(claimId, kept.map(({ key: _k, ...l }) => l));
      const fresh = await fetchClaimLines(claimId);
      toast.success(`${fresh.length} claim line${fresh.length === 1 ? "" : "s"} saved`);
      onSaved(fresh);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save claim lines");
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full rounded border border-input bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring";
  const total = rows.reduce((s, r) => s + ((r.prevQty ?? 0) + (r.currQty ?? 0)) * (r.rate ?? 0), 0);

  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid="claim-lines-editor">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-card-foreground">Claim lines (schedule of work)</p>
        <p className="text-[11px] text-muted-foreground">Cum. work done: <b className="tabular-nums">${money(total)}</b></p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-1 py-1 w-10">Sec</th>
              <th className="px-1 py-1 w-36">Zone</th>
              <th className="px-1 py-1 w-12">S/N</th>
              <th className="px-1 py-1 min-w-[220px]">Description</th>
              <th className="px-1 py-1 w-14">Unit</th>
              <th className="px-1 py-1 w-16 text-right">Qty</th>
              <th className="px-1 py-1 w-16 text-right">Rate</th>
              <th className="px-1 py-1 w-16 text-right">Prev qty</th>
              <th className="px-1 py-1 w-16 text-right">Curr qty</th>
              <th className="px-1 py-1 w-20 text-right">Cum $</th>
              <th className="px-1 py-1 w-32">Remarks</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cum = ((r.prevQty ?? 0) + (r.currQty ?? 0)) * (r.rate ?? 0);
              return (
                <tr key={r.key} className="border-t border-border/60 align-top">
                  <td className="px-1 py-1">
                    <select className={inp} value={r.section} onChange={(e) => patch(r.key, { section: e.target.value as "A" | "B" })}>
                      <option value="A">A</option>
                      <option value="B">B</option>
                    </select>
                  </td>
                  <td className="px-1 py-1"><input className={inp} placeholder="H92 ZONE 28 - WST" value={r.zone} onChange={(e) => patch(r.key, { zone: e.target.value })} /></td>
                  <td className="px-1 py-1"><input className={inp} placeholder="A1" value={r.pgRef} onChange={(e) => patch(r.key, { pgRef: e.target.value })} /></td>
                  <td className="px-1 py-1">
                    <textarea className={inp} rows={2} placeholder="To Floor&#10;Surface preparation…" value={r.description} onChange={(e) => patch(r.key, { description: e.target.value })} />
                  </td>
                  <td className="px-1 py-1"><input className={inp} value={r.unit} onChange={(e) => patch(r.key, { unit: e.target.value })} /></td>
                  <td className="px-1 py-1"><input className={`${inp} text-right`} inputMode="decimal" value={r.qty ?? ""} onChange={(e) => patch(r.key, { qty: num(e.target.value) })} /></td>
                  <td className="px-1 py-1"><input className={`${inp} text-right`} inputMode="decimal" value={r.rate ?? ""} onChange={(e) => patch(r.key, { rate: num(e.target.value) })} /></td>
                  <td className="px-1 py-1"><input className={`${inp} text-right`} inputMode="decimal" value={r.prevQty ?? ""} onChange={(e) => patch(r.key, { prevQty: num(e.target.value) })} /></td>
                  <td className="px-1 py-1"><input className={`${inp} text-right`} inputMode="decimal" value={r.currQty ?? ""} onChange={(e) => patch(r.key, { currQty: num(e.target.value) })} /></td>
                  <td className="px-1 py-1 text-right tabular-nums pt-2">{money(cum)}</td>
                  <td className="px-1 py-1"><input className={inp} placeholder="Work Done: 17-23 Aug'26" value={r.remarks} onChange={(e) => patch(r.key, { remarks: e.target.value })} /></td>
                  <td className="px-1 py-1">
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove line">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blank(nextKey(), rs[rs.length - 1]?.section ?? "A", rs[rs.length - 1]?.quotationRef ?? "")])}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5" /> Add line
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary">Cancel</button>
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {saving ? "Saving…" : "Save lines"}
        </button>
      </div>
    </div>
  );
}
