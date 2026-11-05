import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ClaimLine } from "@/data/sampleData";
import { dbSaveClaimLines, fetchClaimLines, type ClaimLineInput } from "@/data/db";
import {
  blankPeriod, periodLabel, renumber, rollUp, seedPeriods, workDoneLabel, type WorkDonePeriod,
} from "@/lib/workDone";
import ClaimWorkDonePanel, { type WdrState } from "@/components/ClaimWorkDonePanel";

interface Props {
  claimId: string;
  projectCode: string;
  claimNo: string | number;
  lines: ClaimLine[];
  wdr: WdrState | null;
  onWdrChange: (w: WdrState | null) => void;
  onSaved: (lines: ClaimLine[]) => void;
  onCancel: () => void;
}

type Draft = ClaimLineInput & { key: number; id: string | null; periods: WorkDonePeriod[] };

const toDraft = (l: ClaimLine, key: number): Draft => ({
  key,
  id: l.id,
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
  periods: seedPeriods(l, l.periods),
});

const blank = (key: number, section: "A" | "B", quotationRef: string): Draft => ({
  key, id: null, section, quotationRef, pgRef: "", zone: "", description: "", unit: "m2",
  qty: null, rate: null, prevQty: 0, currQty: 0, remarks: "", periods: [blankPeriod(1)],
});

const num = (v: string): number | null => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const money = (n: number) => n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyStr = (n: number) => (n ? String(Math.round(n * 100) / 100) : "0");

export default function ClaimLinesEditor({
  claimId, projectCode, claimNo, lines, wdr, onWdrChange, onSaved, onCancel,
}: Props) {
  const [rows, setRows] = useState<Draft[]>(() =>
    lines.length ? lines.map(toDraft) : [blank(1, "A", "")],
  );
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const nextKey = () => Math.max(0, ...rows.map((r) => r.key)) + 1;

  const patch = (key: number, p: Partial<Draft>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const patchPeriod = (key: number, seq: number, p: Partial<WorkDonePeriod>) =>
    setRows((rs) => rs.map((r) => (r.key === key
      ? { ...r, periods: r.periods.map((x) => (x.seq === seq ? { ...x, ...p } : x)) }
      : r)));

  const addPeriod = (key: number) =>
    setRows((rs) => rs.map((r) => (r.key === key
      ? { ...r, periods: renumber([...r.periods, blankPeriod(r.periods.length + 1)]) }
      : r)));

  const removePeriod = (key: number, seq: number) =>
    setRows((rs) => rs.map((r) => (r.key === key
      ? { ...r, periods: renumber(r.periods.filter((x) => x.seq !== seq)) }
      : r)));

  const toggle = (key: number) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  /**
   * Fold a WDR scan into the breakdown: each matched line gets its CURRENT
   * period set to what the scan read, dated from the report. Earlier periods
   * are never touched — they were agreed on previous claims.
   */
  const applyPrefill = (applied: { periodFrom: string | null; periodTo: string | null; current: Record<string, { qty: number; location: string }> }) => {
    const touched = new Set<number>();
    setRows((rs) => rs.map((r) => {
      if (!r.id) return r;
      const hit = applied.current[r.id];
      if (!hit) return r;
      touched.add(r.key);
      const earlier = r.periods.filter((p) => !p.isCurrent);
      const existing = r.periods.find((p) => p.isCurrent);
      const current: WorkDonePeriod = {
        ...(existing ?? blankPeriod(earlier.length + 1)),
        periodFrom: applied.periodFrom ?? existing?.periodFrom ?? null,
        periodTo: applied.periodTo ?? existing?.periodTo ?? null,
        location: hit.location || existing?.location || "",
        qty: hit.qty,
        isCurrent: true,
        source: "wdr",
        // Drop a hand-typed label so the dates the scan read are what shows;
        // the person can type over it again before saving.
        label: "",
      };
      return { ...r, periods: renumber([...earlier, current]) };
    }));
    setOpen((o) => new Set([...o, ...touched]));
  };

  const save = async () => {
    const kept = rows.filter((r) => r.description.trim() !== "");
    if (kept.length === 0 && !window.confirm("Save with no line items? Existing lines will be removed.")) return;
    setSaving(true);
    try {
      await dbSaveClaimLines(claimId, kept.map(({ key: _k, id: _i, periods, ...l }) => ({
        ...l,
        // Send the breakdown only when it says something; an untouched line
        // keeps its plain prev/curr figures and prints as it always has.
        periods: periods.some((p) => p.qty || periodLabel(p)) ? periods : undefined,
      })));
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
  const total = rows.reduce((s, r) => s + rollUp(r.periods).cumQty * (r.rate ?? 0), 0);

  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid="claim-lines-editor">
      <ClaimWorkDonePanel
        claimId={claimId}
        projectCode={projectCode}
        claimNo={claimNo}
        wdr={wdr}
        onWdrChange={onWdrChange}
        lines={rows.filter((r) => r.id).map((r) => ({
          id: r.id as string, pgRef: r.pgRef, zone: r.zone, description: r.description,
          unit: r.unit, qty: r.qty, prevQty: rollUp(r.periods).prevQty,
        }))}
        onPrefill={applyPrefill}
      />

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-card-foreground">Claim lines (schedule of work)</p>
        <p className="text-[11px] text-muted-foreground">Cum. work done: <b className="tabular-nums">${money(total)}</b></p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="w-6" />
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
              const { prevQty, currQty, cumQty } = rollUp(r.periods);
              const cum = cumQty * (r.rate ?? 0);
              const isOpen = open.has(r.key);
              return [
                <tr key={r.key} className="border-t border-border/60 align-top">
                  <td className="px-0 py-1">
                    <button
                      type="button" onClick={() => toggle(r.key)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={isOpen ? "Hide work done" : "Show work done"}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </td>
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
                  {/* Prev / Curr are the sum of the work-done periods below, so the
                      claim can never show a total its own breakdown contradicts. */}
                  <td className="px-1 py-1 pt-2 text-right tabular-nums text-muted-foreground">{qtyStr(prevQty)}</td>
                  <td className="px-1 py-1 pt-2 text-right tabular-nums text-muted-foreground">{qtyStr(currQty)}</td>
                  <td className="px-1 py-1 text-right tabular-nums pt-2">{money(cum)}</td>
                  <td className="px-1 py-1"><input className={inp} placeholder="Remarks" value={r.remarks} onChange={(e) => patch(r.key, { remarks: e.target.value })} /></td>
                  <td className="px-1 py-1">
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove line">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${r.key}-wd`} className="bg-muted/30">
                    <td />
                    <td colSpan={12} className="px-2 py-2">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Work done — one row per period. Earlier periods count as Previous; the last period is this claim&apos;s.
                      </p>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-left text-[10px] uppercase text-muted-foreground">
                            <th className="w-8 px-1">#</th>
                            <th className="w-28 px-1">From</th>
                            <th className="w-28 px-1">To</th>
                            <th className="w-32 px-1">Location</th>
                            <th className="w-20 px-1 text-right">Qty</th>
                            <th className="w-24 px-1">Counts as</th>
                            <th className="px-1">Prints as</th>
                            <th className="w-6" />
                          </tr>
                        </thead>
                        <tbody>
                          {r.periods.map((p) => (
                            <tr key={p.seq} className="border-t border-border/40">
                              <td className="px-1 py-1 tabular-nums">{p.seq}</td>
                              <td className="px-1 py-1">
                                <input type="date" className={inp} value={p.periodFrom ?? ""} onChange={(e) => patchPeriod(r.key, p.seq, { periodFrom: e.target.value || null })} />
                              </td>
                              <td className="px-1 py-1">
                                <input type="date" className={inp} value={p.periodTo ?? ""} onChange={(e) => patchPeriod(r.key, p.seq, { periodTo: e.target.value || null })} />
                              </td>
                              <td className="px-1 py-1">
                                <input className={inp} placeholder="1st Storey" value={p.location} onChange={(e) => patchPeriod(r.key, p.seq, { location: e.target.value })} />
                              </td>
                              <td className="px-1 py-1">
                                <input className={`${inp} text-right`} inputMode="decimal" value={p.qty || ""} onChange={(e) => patchPeriod(r.key, p.seq, { qty: num(e.target.value) ?? 0 })} />
                              </td>
                              <td className="px-1 py-1">
                                <select className={inp} value={p.isCurrent ? "current" : "previous"} onChange={(e) => patchPeriod(r.key, p.seq, { isCurrent: e.target.value === "current" })}>
                                  <option value="previous">Previous</option>
                                  <option value="current">Current</option>
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  className={inp}
                                  placeholder={workDoneLabel(p.periodFrom, p.periodTo, p.location) || "Work Done: …"}
                                  value={p.label}
                                  onChange={(e) => patchPeriod(r.key, p.seq, { label: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <button type="button" onClick={() => removePeriod(r.key, p.seq)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove period">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button
                        type="button" onClick={() => addPeriod(r.key)}
                        className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                      >
                        <Plus className="h-3 w-3" /> Add period
                      </button>
                    </td>
                  </tr>
                ),
              ];
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
