// Project Reference master: parse the "Project Ref - Standardized" tab of the
// client's Claim Summary workbook, classify each row by type of work, and
// consolidate rows into one line per project for the Project Reference Report
// (VOs and re-entries merged, the way the client's own Epoxy report is laid out).
//
// Erasable-syntax TypeScript only: unit tests import this file directly.

import { cellNumber, cellText, canonDate, type RawCell } from "@/lib/inventoryImport";

export interface ReferenceRow {
  sno: number | null;
  project_code: string | null;
  base_code: string | null;
  sales_rep: string | null;
  project_site: string | null;
  client: string | null;
  contract_value: number | null;
  total_claim_value: number | null;
  balance_work: number | null;
  progress_pct: number | null;
  commencement: string | null;
  completion: string | null;
  officer_in_charge: string | null;
  scope: string | null;
  quotation_ref: string | null;
  supplier: string | null;
  system: string | null;
  type_of_work: string | null;
  standardized_code: string | null;
}

/** Header cells the sheet must carry, in the column order we read. */
const HEADERS = [
  /^project code$/i,
  /^sales rep$/i,
  /^s\/?no\.?$/i,
  /^project\s*\/\s*site$/i,
  /^client$/i,
  /^contract value$/i,
  /^total claim value$/i,
  /balance\s*work/i,
  /^progress/i,
  /commencement/i,
  /completion/i,
  /officer/i,
  /^scope/i,
  /^quotation/i,
  /^supplier$/i,
  /^system$/i,
  /standardi[sz]ed type of work/i,
  /standardi[sz]ed code/i,
];

export function findReferenceHeader(cells: RawCell[][]): number {
  for (let i = 0; i < Math.min(cells.length, 30); i++) {
    const r = cells[i] ?? [];
    if (HEADERS[0].test(cellText(r[0]) ?? "") && HEADERS[16].test(cellText(r[16]) ?? "")) return i;
  }
  return -1;
}

/** "E25077 (VO)" / "E18041 ( E )" / "E19001 E18005" → "E25077" / "E18041" / "E19001". */
export function baseCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const m = String(code).trim().toUpperCase().match(/^([A-Z]{0,2}\d{2,5}(?:\/\d{2})?[A-Z]?)/);
  return m ? m[1] : String(code).trim().split(/[\s(]/)[0] || null;
}

/** Normalised type-of-work tokens: "POWER FLOAT / HARDENER / EPOXY" → ["POWER FLOAT","HARDENER","EPOXY"]. */
export function workTokens(typeOfWork: string | null | undefined): string[] {
  if (!typeOfWork) return [];
  return String(typeOfWork)
    .split("/")
    .map((t) => t.replace(/\s+/g, " ").trim().toUpperCase())
    .filter(Boolean);
}

/** The client's two filter bands: Epoxy works = any EPOXY token; everything else = MISC works. */
export function workBand(typeOfWork: string | null | undefined): "EPOXY" | "MISC" | "UNCLASSIFIED" {
  const t = workTokens(typeOfWork);
  if (t.length === 0) return "UNCLASSIFIED";
  return t.some((x) => x.includes("EPOXY")) ? "EPOXY" : "MISC";
}

export function parseReferenceSheet(cells: RawCell[][]): { rows: ReferenceRow[]; headerIndex: number } {
  const headerIndex = findReferenceHeader(cells);
  if (headerIndex < 0) {
    throw new Error('Could not find the "Project Code … STANDARDIZED TYPE OF WORK" header row. Drop the Claim Summary workbook (it has the "Project Ref - Standardized" tab).');
  }
  const rows: ReferenceRow[] = [];
  for (let i = headerIndex + 1; i < cells.length; i++) {
    const r = cells[i] ?? [];
    const code = cellText(r[0]);
    const site = cellText(r[3]);
    if (!code && !site) continue;
    rows.push({
      sno: cellNumber(r[2]),
      project_code: code,
      base_code: baseCode(code),
      sales_rep: cellText(r[1]),
      project_site: site,
      client: cellText(r[4]),
      contract_value: cellNumber(r[5]),
      total_claim_value: cellNumber(r[6]),
      balance_work: cellNumber(r[7]),
      progress_pct: cellNumber(r[8]),
      commencement: isoOnly(canonDate(r[9])),
      completion: isoOnly(canonDate(r[10])),
      officer_in_charge: cellText(r[11]),
      scope: cellText(r[12]),
      quotation_ref: cellText(r[13]),
      supplier: cellText(r[14]),
      system: cellText(r[15]),
      type_of_work: cellText(r[16]),
      standardized_code: cellText(r[17]),
    });
  }
  return { rows, headerIndex };
}

// ---------------------------------------------------------------- report

export interface ReportLine {
  key: string; // base code, or the site name when there is no code
  codes: string[]; // every code entry merged into this line, in sheet order
  project_name: string;
  client: string;
  scope: string;
  contract_value: number; // sum of the base entry (first row) — the award
  total_contract_value: number; // sum of every merged row (award + VOs)
  progress_pct: number | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  sales_rep: string | null;
  type_of_work: string | null;
  standardized_code: string | null;
  band: "EPOXY" | "MISC" | "UNCLASSIFIED";
  rows: number;
  /** "master" = from the Standardized sheet; "app" = exists only in the app's projects table. */
  source: "master" | "app";
}

/** Date columns hold "TBA" and free text as often as dates; the DB column is a date. */
const isoOnly = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/** "HPC Builders Pte Ltd 7 Kung Chong Road, Level 5, Singapore 159144" → "HPC Builders Pte Ltd". */
export function clientShort(client: string | null | undefined): string {
  const s = (client ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const m = s.match(/^(.*?\b(?:pte\.? ltd\.?|ltd\.?|limited|llp|inc\.?|corp\.?|bhd\.?|sdn\.? bhd\.?))/i);
  if (m) return m[1].trim();
  const firstLine = (client ?? "").split("\n")[0].trim();
  return firstLine.length > 0 && firstLine.length < 60 ? firstLine : s.slice(0, 60);
}

/**
 * One report line per project: rows with the same base code (E25077, E25077 (VO), …)
 * are merged, the first row supplies name/client/scope, contract values add up.
 */
export function consolidate(rows: ReferenceRow[]): ReportLine[] {
  const map = new Map<string, ReportLine>();
  for (const r of rows) {
    const key = r.base_code ?? `site:${(r.project_site ?? "").toLowerCase()}`;
    const existing = map.get(key);
    const value = r.contract_value ?? 0;
    if (!existing) {
      map.set(key, {
        key,
        codes: r.project_code ? [r.project_code] : [],
        project_name: r.project_site ?? "",
        client: clientShort(r.client),
        scope: r.scope ?? "",
        contract_value: value,
        total_contract_value: value,
        progress_pct: r.progress_pct,
        start_date: r.commencement,
        end_date: r.completion,
        location: null,
        sales_rep: r.sales_rep,
        type_of_work: r.type_of_work,
        standardized_code: r.standardized_code,
        band: workBand(r.type_of_work),
        rows: 1,
        source: "master",
      });
      continue;
    }
    if (r.project_code && !existing.codes.includes(r.project_code)) existing.codes.push(r.project_code);
    existing.total_contract_value += value;
    existing.rows += 1;
    if (existing.progress_pct == null && r.progress_pct != null) existing.progress_pct = r.progress_pct;
    if (!existing.start_date && r.commencement) existing.start_date = r.commencement;
    if (r.completion && (!existing.end_date || r.completion > existing.end_date)) existing.end_date = r.completion;
    if (!existing.type_of_work && r.type_of_work) {
      existing.type_of_work = r.type_of_work;
      existing.standardized_code = r.standardized_code;
      existing.band = workBand(r.type_of_work);
    }
    if (!existing.scope && r.scope) existing.scope = r.scope;
  }
  return [...map.values()];
}

export interface ReportFilter {
  band?: "ALL" | "EPOXY" | "MISC";
  tokens?: string[]; // every selected token must be present
  salesRep?: string | null;
  yearFrom?: number | null; // by start_date year
  yearTo?: number | null;
  search?: string;
}

export function filterReport(lines: ReportLine[], f: ReportFilter): ReportLine[] {
  const q = (f.search ?? "").trim().toLowerCase();
  const want = (f.tokens ?? []).map((t) => t.toUpperCase());
  return lines.filter((l) => {
    if (f.band && f.band !== "ALL" && l.band !== f.band) return false;
    if (want.length) {
      const have = workTokens(l.type_of_work);
      if (!want.every((w) => have.includes(w))) return false;
    }
    if (f.salesRep && (l.sales_rep ?? "") !== f.salesRep) return false;
    const y = l.start_date ? Number(l.start_date.slice(0, 4)) : null;
    if (f.yearFrom && (y == null || y < f.yearFrom)) return false;
    if (f.yearTo && (y == null || y > f.yearTo)) return false;
    if (q) {
      const hay = `${l.codes.join(" ")} ${l.project_name} ${l.client} ${l.scope} ${l.type_of_work ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct tokens across the master, most frequent first — feeds the filter chips. */
export function tokenCounts(lines: ReportLine[]): { token: string; count: number }[] {
  const c = new Map<string, number>();
  for (const l of lines) for (const t of new Set(workTokens(l.type_of_work))) c.set(t, (c.get(t) ?? 0) + 1);
  return [...c.entries()].map(([token, count]) => ({ token, count })).sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
}

// ---------------------------------------------------------------- app projects not yet in the master

export interface AppProject {
  project_code: string;
  name: string | null;
  client_name: string | null;
  contract_value: number | string | null;
  total_contract_value: number | string | null;
  vo_value: number | string | null;
  work_type_code: string | null;
  start_date: string | null;
  end_date: string | null;
  sales_manager: string | null;
  scope: string | null;
  location: string | null;
  status: string | null;
  coating_system?: string | null;
}

/** Keyword → type-of-work token, in the master's own vocabulary; used when an app project has no code. */
const TEXT_TOKENS: [RegExp, string][] = [
  [/epoxy|\bep\b|stopox|epocem|ucrete\s*ud/i, "EPOXY"],
  [/polyurethane|\bpu\b|stopur|ucrete\s*mf|traffic deck|\bpac\b/i, "PU"],
  [/hardener/i, "HARDENER"],
  [/power float|powerfloat/i, "POWER FLOAT"],
  [/screed/i, "SCREEDING"],
  [/mortar|eps-gp|eps gp/i, "MORTAR"],
  [/marking|car ?park line/i, "MARKING"],
  [/coving|cove/i, "COVING"],
  [/anti-?static|\besd\b/i, "ANTI-STATIC"],
  [/self-?level/i, "SELF-LEVELING"],
  [/tiling|\btiles?\b/i, "TILING"],
  [/plaster/i, "PLASTER"],
  [/waterproof/i, "WATERPROOFING"],
  [/repair|making good|make good/i, "REPAIR"],
  [/grind/i, "GRINDING"],
  [/joint|sealant/i, "SEALANT"],
];

/** "Supply And Apply Of Epoxy Floor Coating Including Floor Hardener" → "EPOXY / HARDENER". */
export function inferTypeFromText(...texts: (string | null | undefined)[]): string | null {
  const hay = texts.filter(Boolean).join(" ");
  if (!hay.trim()) return null;
  const found: string[] = [];
  for (const [re, tok] of TEXT_TOKENS) if (re.test(hay) && !found.includes(tok)) found.push(tok);
  return found.length ? found.join(" / ") : null;
}

/** Learn "CP01-EP-MR" → "EPOXY / MORTAR" from the master itself (most frequent wording wins). */
export function codeTypeMap(rows: ReferenceRow[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.standardized_code || !r.type_of_work) continue;
    const code = r.standardized_code.trim().toUpperCase();
    const m = counts.get(code) ?? new Map<string, number>();
    const t = workTokens(r.type_of_work).join(" / ");
    m.set(t, (m.get(t) ?? 0) + 1);
    counts.set(code, m);
  }
  const out = new Map<string, string>();
  for (const [code, m] of counts) out.set(code, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

const num = (v: number | string | null | undefined) => (v == null || v === "" ? 0 : Number(v) || 0);

/**
 * App projects whose base code is not in the master become extra report lines,
 * flagged source = "app", so a project set up in the app last week is listed
 * even before the client re-uploads their workbook.
 */
export function appOnlyLines(projects: AppProject[], masterLines: ReportLine[], masterRows: ReferenceRow[]): ReportLine[] {
  const inMaster = new Set(masterLines.map((l) => l.key));
  const types = codeTypeMap(masterRows);
  const out: ReportLine[] = [];
  for (const p of projects) {
    const key = baseCode(p.project_code);
    if (!key || inMaster.has(key) || out.some((l) => l.key === key)) continue;
    if (/^ZZ|TEST/i.test(p.project_code)) continue; // demo / mock projects
    const code = p.work_type_code?.trim().toUpperCase() ?? null;
    const type = (code ? types.get(code) ?? null : null) ?? inferTypeFromText(p.scope, p.coating_system, p.name);
    const cv = num(p.contract_value);
    const tcv = num(p.total_contract_value) || cv + num(p.vo_value);
    out.push({
      key,
      codes: [p.project_code],
      project_name: p.name ?? "",
      client: clientShort(p.client_name),
      scope: p.scope ?? "",
      contract_value: cv,
      total_contract_value: tcv,
      progress_pct: null,
      start_date: p.start_date,
      end_date: p.end_date,
      location: p.location,
      sales_rep: p.sales_manager,
      type_of_work: type,
      standardized_code: code,
      band: workBand(type),
      rows: 1,
      source: "app",
    });
  }
  return out;
}

