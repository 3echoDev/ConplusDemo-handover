import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import master from "./fixtures/claim_master_e25077.json";
import { buildClaimWorkbook, CLAIM_SHEET_COVER, CLAIM_SHEET_DETAILS } from "@/lib/claimExcel";
import type { ClaimDocContext } from "@/lib/claimDocument";
import type { Claim, ClaimLine } from "@/data/sampleData";

const YELLOW = "FFFFFF99";
const ws = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const nospace = (s: unknown) => String(s ?? "").replace(/\s+/g, "");

// Build the E25077 claim 01 from the master's own schedule so the comparison
// is against the client-corrected figures, not numbers typed into the test.
const items = master.details.items as { pgRef: string; description: string; unit: string; qty: number; rate: number; currQty: number; remarks: string | null; row: number; yellow: string[]; subYellow: string[] }[];
const zones = master.details.zones as { row: number; text: string }[];
const zoneFor = (row: number) => [...zones].reverse().find((z) => z.row < row)?.text ?? "";
const lines: ClaimLine[] = items.map((it, i) => {
  const cum = Math.round(it.currQty * it.rate * 100) / 100;
  return {
    id: `l${i}`, claimId: "c1", section: "A", quotationRef: "Q26259-2E/082026/186/WF", seq: i + 1, pgRef: it.pgRef,
    zone: zoneFor(it.row), description: it.description.replace("To CeilingSurface", "To Ceiling\nSurface"), unit: it.unit,
    qty: it.qty, rate: it.rate, contractAmount: it.qty * it.rate, prevQty: 0, prevAmount: 0, currQty: it.currQty,
    currAmount: cum, cumQty: it.currQty, cumAmount: cum, verifiedQty: null, verifiedAmount: null, remarks: it.remarks ?? "",
  };
});
const workDone = lines.reduce((s, l) => s + (l.cumAmount ?? 0), 0);
const claim: Claim = {
  id: "c1", claimNumber: "CLM-E25077-1", projectId: "p1", projectCode: "E25077",
  projectName: "STA Singapore Phase 1 at Tuas South Avenue 12 (Building H92)",
  amount: Math.round((workDone * 0.9) * 100) / 100, claimNo: 1, totalClaim: null, certifiedAmount: null, remarks: "", gst: null,
  totalAmount: null, poRef: "", woRef: "", doRef: "", paymentTerms: "30 days", firstReleasePct: null, secondReleasePct: null,
  advancePayment: null, advanceRecovery: null, clientName: "HPC Builders Pte Ltd",
  clientAddress: "7 Kung Chong Road\nSingapore 159144", contactPerson: "Chan Chia Hian, Jason", contactNumber: "6227 7927 (ext. 6021)",
  submittedDate: "2026-09-08", claimDate: "2026-09-04", isFinal: false, retentionAmount: null, retentionPct: 10, netAmount: null,
  status: "submitted", description: "Supply & Installation of Epoxy Coating to Floor, Wall & Ceiling at Building H92", lines,
};
const ctx: ClaimDocContext = {
  subContractSum: 111696, retentionPct: 10, retentionCapPct: 5, gstPct: 9,
  clientEmail: "chiahian@hpc.sg", preparedBy: "Hnin (QS)", authorisedBy: "Jensen Lim",
};

let wb: ExcelJS.Workbook;
let cover: ExcelJS.Worksheet;
let det: ExcelJS.Worksheet;
const fillOf = (sheet: ExcelJS.Worksheet, addr: string) => {
  const f = sheet.getCell(addr).fill as ExcelJS.FillPattern | undefined;
  return f && f.type === "pattern" ? (f.fgColor?.argb ?? null) : null;
};
const val = (sheet: ExcelJS.Worksheet, addr: string) => {
  const v = sheet.getCell(addr).value as ExcelJS.CellValue;
  if (v && typeof v === "object" && "formula" in v) return (v as ExcelJS.CellFormulaValue).result;
  return v;
};
const formulaOf = (sheet: ExcelJS.Worksheet, addr: string) => {
  const v = sheet.getCell(addr).value as ExcelJS.CellValue;
  return v && typeof v === "object" && "formula" in v ? (v as ExcelJS.CellFormulaValue).formula : null;
};

beforeAll(async () => {
  // Round-trip through the xlsx writer so we assert what Excel will open.
  const built = buildClaimWorkbook(claim, ctx);
  const buf = await built.xlsx.writeBuffer();
  wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  cover = wb.getWorksheet(CLAIM_SHEET_COVER)!;
  det = wb.getWorksheet(CLAIM_SHEET_DETAILS)!;
});

describe("claim workbook vs corrected master", () => {
  it("has the master's sheets", () => {
    expect(wb.worksheets.map((s) => s.name)).toEqual(master.sheets);
  });

  it("cover page labels sit in the master's cells", () => {
    const labels = master.cover.labels as Record<string, string | null>;
    for (const [addr, text] of Object.entries(labels)) {
      if (text == null) continue;
      if (addr === "C50") continue; // retention wording asserted separately
      expect(ws(val(cover, addr)), addr).toBe(ws(text));
    }
    expect(ws(val(cover, "C50"))).toBe("Less: Retention (10%) — Max 5% of Sub-Contract Sum");
  });

  it("cover page input cells are yellow and totals rows are shaded", () => {
    for (const addr of master.cover.yellow as string[]) expect(fillOf(cover, addr), addr).toBe(YELLOW);
    expect(fillOf(cover, "B43")).toBe(master.cover.fills.B43);
    expect(fillOf(cover, "D47")).toBe(master.cover.fills.D47);
    expect(fillOf(cover, "F53")).toBe(master.cover.fills.F53);
    expect(fillOf(cover, "B32")).toBe(master.cover.fills.B32);
  });

  it("cover ladder carries live formulas and the E25077 figures", () => {
    expect(formulaOf(cover, "F50")).toMatch(/ROUND\(\(F47\+F48-F49\)\*E50,2\)/);
    expect(formulaOf(cover, "F45")).toMatch(/'Claim Details'!O\d+/);
    expect(val(cover, "F47")).toBeCloseTo(workDone, 2);
    expect(val(cover, "F50")).toBeCloseTo(-Math.round(workDone * 10) / 100, 2);
    expect(val(cover, "F55")).toBeCloseTo(workDone * 0.9, 2);
    expect(val(cover, "F57")).toBeCloseTo(workDone * 0.9 * 1.09, 2);
    expect(val(cover, "E50")).toBeCloseTo(0.1, 6);
  });

  it("claim details column headers match", () => {
    const headers = master.details.headers as Record<string, string | null>;
    for (const [addr, text] of Object.entries(headers)) {
      if (text == null || String(text).startsWith("=")) continue;
      expect(ws(val(det, addr)), addr).toBe(ws(text));
    }
    expect(fillOf(det, "B10")).toBe(master.details.fills.B10);
    expect(fillOf(det, "B13")).toBe(master.details.fills.B13);
    expect(ws(val(det, "C14"))).toBe(ws(master.details.quotationRef));
  });

  it("writes the 11 section-A items with multi-line descriptions, zones, and yellow current-qty cells", () => {
    // Walk column B for the A1..A11 rows in order.
    const found: { row: number; pgRef: string }[] = [];
    det.eachRow((row, n) => {
      const b = row.getCell(2).value;
      if (typeof b === "string" && /^A\d+$/.test(b)) found.push({ row: n, pgRef: b });
    });
    expect(found.map((f) => f.pgRef)).toEqual(items.map((i) => i.pgRef));
    found.forEach((f, i) => {
      const it = items[i];
      expect(nospace(val(det, `C${f.row}`)), `${it.pgRef} description`).toBe(nospace(it.description));
      expect(String(val(det, `C${f.row}`)).split("\n").length, `${it.pgRef} is multi-line`).toBeGreaterThanOrEqual(it.description.includes("Surface") ? 4 : 1);
      expect(val(det, `D${f.row}`)).toBe(it.unit);
      expect(val(det, `E${f.row}`)).toBe(it.qty);
      expect(val(det, `F${f.row}`)).toBe(it.rate);
      expect(formulaOf(det, `G${f.row}`)).toBe(`E${f.row}*F${f.row}`);
      for (const col of it.yellow) expect(fillOf(det, `${col}${f.row}`), `${col}${f.row} yellow`).toBe(YELLOW);
      for (const col of it.subYellow) expect(fillOf(det, `${col}${f.row + 1}`), `${col}${f.row + 1} yellow`).toBe(YELLOW);
      expect(val(det, `K${f.row + 1}`)).toBe(it.currQty);
      if (it.remarks) expect(val(det, `C${f.row + 1}`)).toBe(it.remarks);
    });
    // Zone header rows appear in column C, in order, above their first item.
    const zoneCells: string[] = [];
    det.eachRow((row) => {
      const c = row.getCell(3).value;
      if (typeof c === "string" && c.startsWith("H92")) zoneCells.push(c);
    });
    expect(zoneCells).toEqual(zones.map((z) => z.text));
  });

  it("subtotals use SUBTOTAL/SUMIF like the master and total the work done", () => {
    let subtotalRow = 0;
    det.eachRow((row, n) => {
      if (String(row.getCell(2).value ?? "").startsWith("Subtotal — Sub-Contract Works")) subtotalRow = n;
    });
    expect(subtotalRow).toBeGreaterThan(0);
    expect(formulaOf(det, `G${subtotalRow}`)).toMatch(/^SUBTOTAL\(9,G\d+:G\d+\)$/);
    expect(formulaOf(det, `O${subtotalRow}`)).toMatch(/^SUMIF\(F\d+:F\d+,"<>",O\d+:O\d+\)$/);
    expect(val(det, `O${subtotalRow}`)).toBeCloseTo(workDone, 2);
    expect(val(det, `G${subtotalRow}`)).toBeCloseTo(items.reduce((s, i) => s + i.qty * i.rate, 0), 2);
  });
});
