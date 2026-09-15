// Excel → material_movements importer for the client's Material_Inventory_Record.
//
// The workbook's "Sheet2" is NOT a transaction log: each row is one stock line
// (material × location × batch) with Quantity_IN and Quantity_OUT side by side.
// material_movements mirrors it (source = 'inventory_record_sheet2'). The S/No.
// column is a ROW() formula, so it renumbers whenever the client inserts or
// deletes a line — it cannot be used as a key. Each upload is therefore a
// SNAPSHOT: every sheet-sourced ledger row is replaced by the sheet's rows,
// Store-form rows are kept, and the recompute trigger settles the balances.
//
// Material names are the catalog. An exact (whitespace / separator
// insensitive) match reuses the existing materials row; anything else is a new
// material, because the client's new master distinguishes colours ("RAL 7037")
// that the old catalog merged. Old materials that end up with no stock rows at
// all can be deactivated so the watchlist stops listing them as "out".
//
// Erasable-syntax TypeScript only: unit tests import this file directly.

import { resolveMaterial, normalizeMaterialName, type MaterialLike } from "@/lib/materialMatch";

export const INVENTORY_SOURCE = "inventory_record_sheet2";

/** Cell value as ExcelJS hands it back (or as a plain matrix in tests). */
export type RawCell =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | { formula?: unknown; result?: unknown; text?: unknown; richText?: { text: string }[] };

export interface SheetRow {
  sno: number;
  supplier: string | null;
  location: string | null;
  material: string | null;
  expiryDate: string | null;
  shelfLife: string | null;
  packing: number | null;
  uom: string | null;
  coatingType: string | null;
  qtyIn: number | null;
  dateIn: string | null;
  projectIn: string | null;
  remarksIn: string | null;
  qtyOut: number | null;
  dateOut: string | null;
  projectOut: string | null;
  remarksOut: string | null;
}

/** One line of the workbook's "Material" master sheet (unit + shelf life per part). */
export interface MasterEntry {
  supplier: string | null;
  material: string;
  unit: string | null;
  shelfLifeA: string | null;
  shelfLifeB: string | null;
  shelfLifeC: string | null;
  shelfLifeD: string | null;
}

/** The subset of a material_movements row the importer reads back. */
export interface ExistingMovement {
  id: string;
  sno: number | null;
  material_id: string | null;
  qty_in: number | string | null;
  qty_out: number | string | null;
}

export interface MaterialRef extends MaterialLike {
  qtyOnHand: number;
  isActive: boolean;
}

export interface BalanceChange {
  materialId: string | null; // null → will be created
  name: string;
  before: number;
  after: number;
  rows: number;
}

export interface ImportPlan {
  /** Sheet rows with a material name (what will be written). */
  rows: SheetRow[];
  /** Rows with a S/No. but no material / quantities — the sheet's empty tail. */
  blank: number;
  /** Distinct materials the sheet references that already exist. */
  matched: number;
  /** Distinct new names that will become materials. */
  toCreate: string[];
  /** Every material whose balance moves, plus new ones. Sorted by |delta| desc. */
  balanceChanges: BalanceChange[];
  /** Materials with sheet rows today but none in this upload and no other stock rows. */
  orphans: MaterialRef[];
  /** Materials referenced by both, whose balance is unchanged. */
  unchanged: number;
}

// ---------------------------------------------------------------- cell helpers

const pad2 = (n: number) => String(n).padStart(2, "0");

/** What the sheet writes when a cell is "nothing": "-", "NA", "N/A", "n.a.". */
const BLANK_TOKENS = new Set(["-", "na", "n/a", "n.a", "n.a.", "nil"]);

const isoFromDate = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/** Unwrap ExcelJS formula / rich-text objects to a primitive. */
export function cellValue(c: RawCell): string | number | boolean | Date | null {
  if (c == null) return null;
  if (typeof c === "object" && !(c instanceof Date)) {
    if (Array.isArray(c.richText)) return c.richText.map((p) => p.text).join("");
    if ("result" in c && c.result != null) return cellValue(c.result as RawCell);
    if ("text" in c && c.text != null) return cellValue(c.text as RawCell);
    return null;
  }
  return c;
}

/** Trimmed text; "-", "NA" and "" collapse to null. */
export function cellText(c: RawCell): string | null {
  const v = cellValue(c);
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoFromDate(v);
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" || BLANK_TOKENS.has(s.toLowerCase()) ? null : s;
}

export function cellNumber(c: RawCell): number | null {
  const v = cellValue(c);
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Dates arrive three ways: a real Excel date, legacy text "DD.MM.YY", or ISO
 * text ("2026-08-30", sometimes with " 00:00:00"). All canonicalise to
 * "YYYY-MM-DD"; anything else (an expiry written as "04/2025") is kept verbatim.
 */
export function canonDate(c: RawCell): string | null {
  const v = cellValue(c);
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoFromDate(v);
  const s = String(v).trim();
  if (s === "" || BLANK_TOKENS.has(s.toLowerCase())) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
  }
  return s;
}

/**
 * Shelf life in Sheet2 is a VLOOKUP whose cached result ExcelJS often returns
 * as garbage. Keep only a value that reads like a duration ("12 months").
 */
export function shelfLifeText(c: RawCell): string | null {
  const t = cellText(c);
  return t && /^\d+\s*(month|months|mth|mths|year|years|yr|yrs)$/i.test(t) ? t : null;
}

/**
 * Material cells sometimes carry a multi-line article note or a kit breakdown
 * ("Article No.: …", "Consists of: - 03 x …"). The name stops before those.
 */
export function cleanMaterialName(c: RawCell): string | null {
  const t = cellText(c);
  if (!t) return null;
  const cut = t.replace(/\s*(Article\s*No\.?:|Consists of:).*$/i, "").trim();
  return cut || null;
}

// ---------------------------------------------------------------- sheet parsing

const HEADER_SNO = /^s\/?no\.?$/i;

/** Locate the header row: first row whose 1st cell is "S/No." and 4th is "Material". */
export function findHeaderRow(cells: RawCell[][]): number {
  for (let i = 0; i < cells.length; i++) {
    const r = cells[i] ?? [];
    const a = cellText(r[0]) ?? "";
    const d = cellText(r[3]) ?? "";
    if (HEADER_SNO.test(a) && /^material$/i.test(d)) return i;
  }
  return -1;
}

/**
 * Turn a cell matrix (row-major, 17 columns in the sheet's order) into rows.
 * Rows without a numeric S/No. are ignored; blank tail rows are kept (the
 * caller counts them).
 */
export function parseInventorySheet(cells: RawCell[][]): { rows: SheetRow[]; headerIndex: number } {
  const headerIndex = findHeaderRow(cells);
  if (headerIndex < 0) {
    throw new Error('Could not find the header row (expects "S/No." in column A and "Material" in column D).');
  }
  const rows: SheetRow[] = [];
  for (let i = headerIndex + 1; i < cells.length; i++) {
    const r = cells[i] ?? [];
    const sno = cellNumber(r[0]);
    if (sno == null || !Number.isInteger(sno) || sno <= 0) continue;
    rows.push({
      sno,
      supplier: cellText(r[1]),
      location: cellText(r[2]),
      material: cleanMaterialName(r[3]),
      expiryDate: canonDate(r[4]),
      shelfLife: shelfLifeText(r[5]),
      packing: cellNumber(r[6]),
      uom: cellText(r[7]),
      coatingType: cellText(r[8]),
      qtyIn: cellNumber(r[9]),
      dateIn: canonDate(r[10]),
      projectIn: cellText(r[11]),
      remarksIn: cellText(r[12]),
      qtyOut: cellNumber(r[13]),
      dateOut: canonDate(r[14]),
      projectOut: cellText(r[15]),
      remarksOut: cellText(r[16]),
    });
  }
  return { rows, headerIndex };
}

export const isBlankRow = (r: SheetRow) =>
  !r.material && (r.qtyIn ?? 0) === 0 && (r.qtyOut ?? 0) === 0;

/**
 * The "Material" master sheet: header "Supplier | Material | UNIT | Shelf Life
 * (PART A..D)" somewhere in columns B..H. Returns entries keyed by
 * normalised name; missing sheet → empty map.
 */
export function parseMaterialMaster(cells: RawCell[][]): Map<string, MasterEntry> {
  const out = new Map<string, MasterEntry>();
  let header = -1;
  let col = -1;
  for (let i = 0; i < cells.length && header < 0; i++) {
    const r = cells[i] ?? [];
    for (let c = 0; c < r.length - 1; c++) {
      if (/^supplier$/i.test(cellText(r[c]) ?? "") && /^material$/i.test(cellText(r[c + 1]) ?? "")) {
        header = i;
        col = c;
        break;
      }
    }
  }
  if (header < 0) return out;
  for (let i = header + 1; i < cells.length; i++) {
    const r = cells[i] ?? [];
    const material = cleanMaterialName(r[col + 1]);
    if (!material) continue;
    const key = normalizeMaterialName(material);
    if (out.has(key)) continue;
    out.set(key, {
      supplier: cellText(r[col]),
      material,
      unit: cellText(r[col + 2]),
      shelfLifeA: shelfLifeText(r[col + 3]),
      shelfLifeB: shelfLifeText(r[col + 4]),
      shelfLifeC: shelfLifeText(r[col + 5]),
      shelfLifeD: shelfLifeText(r[col + 6]),
    });
  }
  return out;
}

// ---------------------------------------------------------------- planning

const num = (v: number | string | null | undefined): number => {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Resolve every sheet row to a material (existing id, or a new name), compute
 * the balance each material will have after the snapshot replaces the current
 * sheet rows, and list old materials that would be left with no stock rows.
 *
 * @param storeFormMaterialIds materials that also have Store-form rows — they
 *        are never orphans even if the sheet drops them.
 */
export function planInventoryImport(
  sheetRows: SheetRow[],
  existing: ExistingMovement[],
  materials: MaterialRef[],
  storeFormMaterialIds: Iterable<string> = [],
): ImportPlan {
  const rows = sheetRows.filter((r) => !isBlankRow(r));
  const blank = sheetRows.length - rows.length;

  // current contribution of sheet rows per material
  const beforeSheet = new Map<string, number>();
  for (const e of existing) {
    if (!e.material_id) continue;
    beforeSheet.set(e.material_id, (beforeSheet.get(e.material_id) ?? 0) + num(e.qty_in) - num(e.qty_out));
  }

  // new contribution per material id, or per new-name key
  const afterExisting = new Map<string, { delta: number; rows: number }>();
  const afterNew = new Map<string, { name: string; delta: number; rows: number }>();
  const byId = new Map(materials.map((m) => [m.id, m]));

  for (const r of rows) {
    const delta = num(r.qtyIn) - num(r.qtyOut);
    if (!r.material) continue; // a quantity with no name: nothing to attach it to (RPC rejects too)
    const res = resolveMaterial(r.material, materials);
    if (res.match) {
      const cur = afterExisting.get(res.match.id) ?? { delta: 0, rows: 0 };
      afterExisting.set(res.match.id, { delta: cur.delta + delta, rows: cur.rows + 1 });
    } else {
      const key = normalizeMaterialName(r.material);
      const cur = afterNew.get(key) ?? { name: r.material, delta: 0, rows: 0 };
      afterNew.set(key, { name: cur.name, delta: cur.delta + delta, rows: cur.rows + 1 });
    }
  }

  const balanceChanges: BalanceChange[] = [];
  let unchanged = 0;
  const touched = new Set<string>([...afterExisting.keys(), ...beforeSheet.keys()]);
  for (const id of touched) {
    const m = byId.get(id);
    if (!m) continue;
    const before = m.qtyOnHand;
    const after = round3(before - (beforeSheet.get(id) ?? 0) + (afterExisting.get(id)?.delta ?? 0));
    if (Math.abs(after - before) < 0.0005) {
      unchanged += 1;
      continue;
    }
    balanceChanges.push({ materialId: id, name: m.name, before, after, rows: afterExisting.get(id)?.rows ?? 0 });
  }
  for (const n of afterNew.values()) {
    balanceChanges.push({ materialId: null, name: n.name, before: 0, after: round3(n.delta), rows: n.rows });
  }
  balanceChanges.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || a.name.localeCompare(b.name));

  const keep = new Set(storeFormMaterialIds);
  const orphans = [...beforeSheet.keys()]
    .filter((id) => !afterExisting.has(id) && !keep.has(id))
    .map((id) => byId.get(id))
    .filter((m): m is MaterialRef => !!m && m.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows,
    blank,
    matched: afterExisting.size,
    toCreate: [...afterNew.values()].map((n) => n.name).sort((a, b) => a.localeCompare(b)),
    balanceChanges,
    orphans,
    unchanged,
  };
}

// ---------------------------------------------------------------- RPC payload

export interface RpcRow {
  sno: number;
  material_id: string | null;
  material_name: string | null;
  supplier_name: string | null;
  location: string | null;
  packing: number | null;
  uom: string | null;
  expiry_date: string | null;
  coating_type: string | null;
  shelf_life: string | null;
  qty_in: number | null;
  date_in: string | null;
  project_in: string | null;
  remarks_in: string | null;
  qty_out: number | null;
  date_out: string | null;
  project_out: string | null;
  remarks_out: string | null;
  /** From the Material master sheet, used only when a material is created. */
  stock_unit: string | null;
  shelf_life_a: string | null;
  shelf_life_b: string | null;
  shelf_life_c: string | null;
  shelf_life_d: string | null;
}

export function toRpcRows(plan: ImportPlan, materials: MaterialLike[], master: Map<string, MasterEntry>): RpcRow[] {
  return plan.rows
    .filter((r) => r.material)
    .map((r) => {
      const res = resolveMaterial(r.material, materials);
      const me = master.get(normalizeMaterialName(r.material));
      return {
        sno: r.sno,
        material_id: res.match?.id ?? null,
        material_name: r.material,
        supplier_name: r.supplier,
        location: r.location,
        packing: r.packing,
        uom: r.uom,
        expiry_date: r.expiryDate,
        coating_type: r.coatingType,
        shelf_life: r.shelfLife ?? me?.shelfLifeA ?? null,
        qty_in: r.qtyIn,
        date_in: r.dateIn,
        project_in: r.projectIn,
        remarks_in: r.remarksIn,
        qty_out: r.qtyOut,
        date_out: r.dateOut,
        project_out: r.projectOut,
        remarks_out: r.remarksOut,
        stock_unit: me?.unit ?? null,
        shelf_life_a: me?.shelfLifeA ?? null,
        shelf_life_b: me?.shelfLifeB ?? null,
        shelf_life_c: me?.shelfLifeC ?? null,
        shelf_life_d: me?.shelfLifeD ?? null,
      };
    });
}
