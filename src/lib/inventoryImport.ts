// Excel → material_movements importer for the client's Material_Inventory_Record.
//
// The workbook's "Sheet2" is NOT a transaction log: each row is one stock line
// (material × location × batch) with Quantity_IN and Quantity_OUT side by side,
// and material_movements mirrors it 1:1 (source = 'inventory_record_sheet2',
// sno = the sheet's S/No.). Re-uploading the whole workbook therefore means:
//   - a S/No. we have never seen → insert
//   - a S/No. whose cells changed → update in place
//   - everything else            → leave alone
// The recompute trigger on material_movements keeps materials.qty_on_hand honest.
//
// Erasable-syntax TypeScript only: unit tests import this file directly.

import { resolveMaterial, type MaterialLike } from "@/lib/materialMatch";

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

/** The subset of a material_movements row the importer reads back. */
export interface ExistingMovement {
  id: string;
  sno: number | null;
  material_id: string | null;
  supplier_name: string | null;
  location: string | null;
  packing: number | string | null;
  uom: string | null;
  expiry_date: string | null;
  coating_type: string | null;
  shelf_life: string | null;
  qty_in: number | string | null;
  date_in: string | null;
  project_in: string | null;
  remarks_in: string | null;
  qty_out: number | string | null;
  date_out: string | null;
  project_out: string | null;
  remarks_out: string | null;
}

export interface FieldChange {
  field: keyof SheetRow;
  before: string | number | null;
  after: string | number | null;
}

export interface PlannedRow {
  row: SheetRow;
  materialId: string | null;
  materialName: string;
  /** Present only for updates. */
  changes?: FieldChange[];
  /** Present only for ambiguous / unmatched rows. */
  candidates?: string[];
}

export interface ImportPlan {
  inserts: PlannedRow[];
  updates: PlannedRow[];
  unchanged: PlannedRow[];
  /** Material name did not resolve to a materials row (or resolved to several). */
  unmatched: PlannedRow[];
  /** Rows with a S/No. but no material / quantities — the sheet's empty tail. */
  blank: number;
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

/** Trimmed text; "-" and "" collapse to null (the sheet uses "-" as its blank). */
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
 * Dates in the sheet arrive three ways: a real Excel date, legacy text
 * "DD.MM.YY", or ISO text from a store-form row ("2026-08-30", sometimes with
 * a trailing " 00:00:00"). All canonicalise to "YYYY-MM-DD"; anything else
 * (e.g. an expiry written as "04/2025") is kept verbatim.
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
 * caller counts them) so the plan can report how much of the sheet is empty.
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
      material: cellText(r[3]),
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

/**
 * Shelf life is a VLOOKUP into the ShelfLife sheet; ExcelJS often returns its
 * cached result as garbage. Keep only a value that looks like one ("12 months"),
 * and even then the importer never uses it to overwrite the material master.
 */
export function shelfLifeText(c: RawCell): string | null {
  const t = cellText(c);
  return t && /^\d+\s*(month|months|mth|mths|year|years|yr|yrs)$/i.test(t) ? t : null;
}

export const isBlankRow = (r: SheetRow) =>
  !r.material && (r.qtyIn ?? 0) === 0 && (r.qtyOut ?? 0) === 0;

// ---------------------------------------------------------------- diffing

const numOrNull = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Both sides of a quantity compare as numbers; the DB stores 0 for the unused side. */
const qtyEq = (a: number | null, b: number | string | null) => (a ?? 0) === (numOrNull(b) ?? 0);
const textEq = (a: string | null, b: string | null | undefined) => (cellText(a) ?? null) === (cellText(b) ?? null);
const dateEq = (a: string | null, b: string | null | undefined) => (canonDate(a) ?? null) === (canonDate(b) ?? null);
const numEq = (a: number | null, b: number | string | null | undefined) => (a ?? null) === (numOrNull(b) ?? null);

const COMPARATORS: {
  field: keyof SheetRow;
  db: keyof ExistingMovement;
  eq: (a: never, b: never) => boolean;
}[] = [
  { field: "supplier", db: "supplier_name", eq: textEq },
  { field: "location", db: "location", eq: textEq },
  { field: "expiryDate", db: "expiry_date", eq: dateEq },
  { field: "packing", db: "packing", eq: numEq },
  { field: "uom", db: "uom", eq: textEq },
  { field: "coatingType", db: "coating_type", eq: textEq },
  { field: "qtyIn", db: "qty_in", eq: qtyEq },
  { field: "dateIn", db: "date_in", eq: dateEq },
  { field: "projectIn", db: "project_in", eq: textEq },
  { field: "remarksIn", db: "remarks_in", eq: textEq },
  { field: "qtyOut", db: "qty_out", eq: qtyEq },
  { field: "dateOut", db: "date_out", eq: dateEq },
  { field: "projectOut", db: "project_out", eq: textEq },
  { field: "remarksOut", db: "remarks_out", eq: textEq },
];

export function diffRow(row: SheetRow, existing: ExistingMovement, materialId: string | null): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const c of COMPARATORS) {
    const a = row[c.field] as never;
    const b = existing[c.db] as never;
    if (!c.eq(a, b)) {
      const before = existing[c.db];
      const numeric = c.eq === qtyEq || c.eq === numEq;
      changes.push({
        field: c.field,
        before: before == null ? null : numeric ? numOrNull(before as number | string) : String(before),
        after: row[c.field] as string | number | null,
      });
    }
  }
  if (materialId && existing.material_id && materialId !== existing.material_id) {
    changes.unshift({ field: "material", before: existing.material_id, after: row.material });
  }
  return changes;
}

export function planInventoryImport<M extends MaterialLike>(
  sheetRows: SheetRow[],
  existing: ExistingMovement[],
  materials: M[],
): ImportPlan {
  const bySno = new Map<number, ExistingMovement>();
  for (const e of existing) if (e.sno != null) bySno.set(Number(e.sno), e);

  const plan: ImportPlan = { inserts: [], updates: [], unchanged: [], unmatched: [], blank: 0 };

  for (const row of sheetRows) {
    if (isBlankRow(row)) {
      plan.blank += 1;
      continue;
    }
    const res = resolveMaterial(row.material, materials);
    const planned: PlannedRow = {
      row,
      materialId: res.match?.id ?? null,
      materialName: res.match?.name ?? row.material ?? "",
    };
    if (!res.match) {
      planned.candidates = res.candidates.map((c) => c.name);
      plan.unmatched.push(planned);
      continue;
    }
    const prev = bySno.get(row.sno);
    if (!prev) {
      plan.inserts.push(planned);
      continue;
    }
    const changes = diffRow(row, prev, planned.materialId);
    if (changes.length === 0) plan.unchanged.push(planned);
    else plan.updates.push({ ...planned, changes });
  }
  return plan;
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
}

export function toRpcRow(p: PlannedRow): RpcRow {
  const r = p.row;
  return {
    sno: r.sno,
    material_id: p.materialId,
    material_name: r.material,
    supplier_name: r.supplier,
    location: r.location,
    packing: r.packing,
    uom: r.uom,
    expiry_date: r.expiryDate,
    coating_type: r.coatingType,
    shelf_life: r.shelfLife,
    qty_in: r.qtyIn,
    date_in: r.dateIn,
    project_in: r.projectIn,
    remarks_in: r.remarksIn,
    qty_out: r.qtyOut,
    date_out: r.dateOut,
    project_out: r.projectOut,
    remarks_out: r.remarksOut,
  };
}

/** Rows the RPC should receive: inserts + updates, plus unmatched only when creating materials. */
export function rpcRowsForPlan(plan: ImportPlan, createMissing: boolean): RpcRow[] {
  const rows = [...plan.inserts, ...plan.updates].map(toRpcRow);
  if (createMissing) rows.push(...plan.unmatched.filter((u) => u.row.material).map(toRpcRow));
  return rows;
}
