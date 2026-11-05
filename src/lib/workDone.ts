// Claim work-done breakdown — item 2 of Wendy's 3 Nov 2026 asks.
//
// A priced claim item carries one "Work Done" sub-row per work period. Her own
// Claim 02 workbook is the spec (Claim Details rows 16-19):
//
//   A1  To Floor ...                            J=SUM(J17:J19)  K=SUM(K17:K19)
//    1  Work Done: 17-23 Aug'26 - 1st Storey    prev 107.64     curr 0
//    2  Work Done: 01-15 Sep'26 - 1st Storey    prev 0          curr 250
//
// Periods already claimed sit in Previous, the period this claim covers sits in
// Current, and the item row sums them. Claim figures stay cumulative and carry
// forward; the WDR behind the current period never carries forward.
//
// Everything here is pure so it can be unit-tested; the browser-bound parts of
// the scan live in wdrScan.ts.

export interface WorkDonePeriod {
  /** 1-based number printed in the S/N column of the sub-row. */
  seq: number;
  /** Printed label. Derived from the dates and location unless overridden. */
  label: string;
  /** ISO YYYY-MM-DD, or null when the team typed a free-text label instead. */
  periodFrom: string | null;
  periodTo: string | null;
  location: string;
  qty: number;
  /** false = claimed in an earlier period (Previous column). */
  isCurrent: boolean;
  source: "manual" | "wdr" | "carried";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Parts { d: string; mon: string; yy: string }

/** Split an ISO date into the pieces Wendy's labels use. Returns null if unparseable. */
function parts(iso: string | null | undefined): Parts | null {
  if (typeof iso !== "string") return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const day = Number(m[3]);
  if (day < 1 || day > 31) return null;
  return { d: m[3], mon: MONTHS[month - 1], yy: m[1].slice(2) };
}

/**
 * Render a work period the way the client writes it:
 *   same month   → "17-23 Aug'26"
 *   across months→ "28 Aug-05 Sep'26"
 *   across years → "28 Dec'25-05 Jan'26"
 *   one day      → "17 Aug'26"
 */
export function formatPeriod(from: string | null | undefined, to: string | null | undefined): string {
  const a = parts(from);
  const b = parts(to);
  if (!a && !b) return "";
  if (!a) return `${b!.d} ${b!.mon}'${b!.yy}`;
  if (!b) return `${a.d} ${a.mon}'${a.yy}`;
  if (a.mon === b.mon && a.yy === b.yy) {
    return a.d === b.d ? `${a.d} ${a.mon}'${a.yy}` : `${a.d}-${b.d} ${a.mon}'${a.yy}`;
  }
  if (a.yy === b.yy) return `${a.d} ${a.mon}-${b.d} ${b.mon}'${b.yy}`;
  return `${a.d} ${a.mon}'${a.yy}-${b.d} ${b.mon}'${b.yy}`;
}

/** "Work Done: 17-23 Aug'26 - 1st Storey" — the sub-row's Description cell. */
export function workDoneLabel(
  from: string | null | undefined,
  to: string | null | undefined,
  location: string | null | undefined,
): string {
  const period = formatPeriod(from, to);
  const where = (location ?? "").trim();
  if (!period && !where) return "";
  if (!period) return `Work Done: ${where}`;
  return where ? `Work Done: ${period} - ${where}` : `Work Done: ${period}`;
}

/** The label to print: an explicit override wins, otherwise derive it. */
export function periodLabel(p: WorkDonePeriod): string {
  const explicit = (p.label ?? "").trim();
  if (explicit) return explicit;
  return workDoneLabel(p.periodFrom, p.periodTo, p.location);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Previous / Current quantities for the item row. With a breakdown present these
 * are the truth — save_claim_lines recomputes claim_lines.prev_qty / curr_qty
 * the same way, so the Excel and the database never disagree.
 */
export function rollUp(periods: WorkDonePeriod[]): { prevQty: number; currQty: number; cumQty: number } {
  let prev = 0;
  let curr = 0;
  for (const p of periods) {
    const q = Number.isFinite(p.qty) ? p.qty : 0;
    if (p.isCurrent) curr += q;
    else prev += q;
  }
  prev = round2(prev);
  curr = round2(curr);
  return { prevQty: prev, currQty: curr, cumQty: round2(prev + curr) };
}

/** Renumber seq 1..n in array order, so removing a middle row never leaves a gap. */
export function renumber(periods: WorkDonePeriod[]): WorkDonePeriod[] {
  return periods.map((p, i) => ({ ...p, seq: i + 1 }));
}

/**
 * The breakdown a line actually has, in seq order — or none at all.
 *
 * A claim written before item 2 has no stored periods, and we must NOT invent
 * them: we do not know when its previous quantity was done, and a label like
 * "previously claimed" would be text we made up on a document that goes to the
 * main contractor. Those lines keep printing the single sub-row they always
 * have (claimExcel falls back to the line's own prev/curr figures).
 */
export function periodsForLine(
  _line: { prevQty: number | null; currQty: number | null; remarks?: string },
  stored: WorkDonePeriod[] | undefined,
): WorkDonePeriod[] {
  if (stored && stored.length) return renumber([...stored].sort((a, b) => a.seq - b.seq));
  return [];
}

/**
 * Starting rows for the editor when a line has no stored breakdown yet. Unlike
 * periodsForLine this DOES fabricate, because nothing is printed until a person
 * has looked at it: the previous quantity becomes one unlabelled carried row for
 * them to date, and the current quantity keeps whatever remarks they had typed.
 */
export function seedPeriods(
  line: { prevQty: number | null; currQty: number | null; remarks?: string },
  stored: WorkDonePeriod[] | undefined,
): WorkDonePeriod[] {
  const existing = periodsForLine(line, stored);
  if (existing.length) return existing;
  const prev = line.prevQty ?? 0;
  const curr = line.currQty ?? 0;
  const out: WorkDonePeriod[] = [];
  if (prev) {
    out.push({ seq: 0, label: "", periodFrom: null, periodTo: null, location: "", qty: prev, isCurrent: false, source: "carried" });
  }
  out.push({
    seq: 0, label: (line.remarks ?? "").trim(), periodFrom: null, periodTo: null,
    location: "", qty: curr, isCurrent: true, source: "manual",
  });
  return renumber(out);
}

/**
 * Carry a line's breakdown into the next claim: every period becomes a previous
 * period. The new claim then adds its own current period from its own WDR.
 * The WDR itself is deliberately NOT carried (Wendy, 3 Nov).
 */
export function carryForward(periods: WorkDonePeriod[]): WorkDonePeriod[] {
  return renumber(
    periods
      .filter((p) => (Number.isFinite(p.qty) ? p.qty : 0) !== 0 || periodLabel(p) !== "")
      .map((p) => ({ ...p, label: periodLabel(p), isCurrent: false, source: "carried" as const })),
  );
}

/** A blank row for the editor's "+ Add period" button. */
export function blankPeriod(seq: number, isCurrent = true): WorkDonePeriod {
  return { seq, label: "", periodFrom: null, periodTo: null, location: "", qty: 0, isCurrent, source: "manual" };
}

/**
 * What the Excel writes under an item. One slot per period, minimum one, so a
 * line with no breakdown prints exactly as it does today.
 */
export function subRowCount(periods: WorkDonePeriod[]): number {
  return Math.max(1, periods.length);
}
