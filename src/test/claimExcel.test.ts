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

describe("claim 02: main contractor's cumulative verified (client Excel, 19 Sep)", () => {
  // Claim 02: A1 claimed 107.64 before + 250 now; main-con verified 100 m2 on Claim 01, nothing new yet.
  const lines2: ClaimLine[] = lines.map((l) => l.pgRef === "A1"
    ? { ...l, claimId: "c2", prevQty: 107.64, prevAmount: 5382, currQty: 250, currAmount: 12500, cumQty: 357.64, cumAmount: 17882, verifiedQty: 100, verifiedAmount: 5000 }
    : { ...l, claimId: "c2", prevQty: 0, prevAmount: 0, currQty: 0, currAmount: 0, cumQty: 0, cumAmount: 0, verifiedQty: 0, verifiedAmount: 0 });
  const claim2: Claim = { ...claim, id: "c2", claimNumber: "CLM-E25077-2", claimNo: 2, lines: lines2 };
  let d2: ExcelJS.Worksheet;
  let c2: ExcelJS.Worksheet;
  let a1 = 0;
  // ExcelJS drops a cached formula result of 0 on write; Excel recalculates it on open.
  const num = (sheet: ExcelJS.Worksheet, addr: string) => val(sheet, addr) ?? 0;

  beforeAll(async () => {
    const built = buildClaimWorkbook(claim2, { ...ctx, previouslyCertified: 4500, previousVerified: { "A|A1": 100 } });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await built.xlsx.writeBuffer()) as ArrayBuffer);
    d2 = book.getWorksheet(CLAIM_SHEET_DETAILS)!;
    c2 = book.getWorksheet(CLAIM_SHEET_COVER)!;
    d2.eachRow((row, n) => { if (!a1 && String(row.getCell("B").value ?? "") === "A1") a1 = n; });
  });

  it("splits A1 verified into previous 100 m2 / $5,000 and current 0", () => {
    expect(a1).toBeGreaterThan(0);
    expect(num(d2, `S${a1}`)).toBe(50);
    expect(num(d2, `T${a1}`)).toBe(100);
    expect(num(d2, `U${a1}`)).toBe(0);
    expect(num(d2, `V${a1}`)).toBe(100);
    expect(num(d2, `W${a1}`)).toBe(5000);
    expect(num(d2, `X${a1}`)).toBe(0);
    expect(num(d2, `Y${a1}`)).toBe(5000);
    expect(num(d2, `AA${a1}`)).toBeCloseTo(5000 - 17882, 2);
  });

  // Client's revised template, 27 Oct 2026: a work-done sub-row holds quantities
  // only. Every amount and Total cell belongs to the item row, so the subtotal's
  // SUBTOTAL(9,…) over M/N/W/X cannot count a sub-row on top of the item row.
  it("leaves amount and Total cells empty on work-done sub-rows", () => {
    const sub = a1 + 1;
    expect(val(d2, `C${sub}`)).toBeTruthy(); // it really is the work-done row
    for (const col of ["L", "M", "N", "O", "V", "W", "X", "Y"]) {
      expect(val(d2, `${col}${sub}`) ?? "", `${col}${sub} is empty`).toBe("");
      expect(formulaOf(d2, `${col}${sub}`), `${col}${sub} has no formula`).toBeNull();
    }
    // The quantity inputs stay, and keep the yellow input fill.
    expect(num(d2, `J${sub}`)).toBe(107.64);
    expect(num(d2, `K${sub}`)).toBe(250);
    for (const col of ["J", "K", "M", "N", "T", "U", "W", "X"])
      expect(fillOf(d2, `${col}${sub}`), `${col}${sub} yellow`).toBe(YELLOW);
  });

  it("subtotals the amount columns over item rows only", () => {
    let subtotalRow = 0;
    d2.eachRow((row, n) => {
      if (String(row.getCell(2).value ?? "").startsWith("Subtotal — Sub-Contract Works")) subtotalRow = n;
    });
    expect(subtotalRow).toBeGreaterThan(0);
    // A1 is the only line with figures: previous 5,382 / current 12,500 claimed,
    // 5,000 / 0 verified. These are the cached results we write; what stops Excel
    // from recalculating them to double is the empty sub-rows asserted above.
    expect(num(d2, `M${subtotalRow}`)).toBeCloseTo(5382, 2);
    expect(num(d2, `N${subtotalRow}`)).toBeCloseTo(12500, 2);
    expect(num(d2, `W${subtotalRow}`)).toBeCloseTo(5000, 2);
    expect(num(d2, `X${subtotalRow}`)).toBeCloseTo(0, 2);
  });

  it("carries the verified total into the cover's Payment Certified column", () => {
    expect(num(c2, "G45")).toBe(5000);
    expect(num(c2, "G47")).toBe(5000);
    expect(num(c2, "G50")).toBe(-500);
    expect(num(c2, "G53")).toBe(4500);
    expect(num(c2, "G54")).toBe(4500);
    expect(num(c2, "G55")).toBe(0);
    expect(num(c2, "F55")).toBeCloseTo(11593.8, 2);
  });
});

describe("claim 02 work-done breakdown (item 2, Wendy 3 Nov 2026)", () => {
  // Her Claim 02 workbook, Claim Details rows 16-19:
  //   A1 item                                    J=SUM(J17:J19)  K=SUM(K17:K19)
  //    1 Work Done: 17-23 Aug'26 - 1st Storey    prev 107.64     curr 0
  //    2 Work Done: 01-15 Sep'26 - 1st Storey    prev 0          curr 250
  const periods = [
    { seq: 1, label: "", periodFrom: "2026-08-17", periodTo: "2026-08-23", location: "1st Storey", qty: 107.64, isCurrent: false, source: "carried" as const },
    { seq: 2, label: "", periodFrom: "2026-09-01", periodTo: "2026-09-15", location: "1st Storey", qty: 250, isCurrent: true, source: "wdr" as const },
  ];
  const lines3: ClaimLine[] = lines.map((l) => l.pgRef === "A1"
    ? { ...l, claimId: "c3", prevQty: 107.64, prevAmount: 5382, currQty: 250, currAmount: 12500, cumQty: 357.64, cumAmount: 17882, periods }
    : { ...l, claimId: "c3", prevQty: 0, prevAmount: 0, currQty: 0, currAmount: 0, cumQty: 0, cumAmount: 0 });
  const claim3: Claim = { ...claim, id: "c3", claimNumber: "CLM-E25077-2", claimNo: 2, lines: lines3 };
  let d3: ExcelJS.Worksheet;
  let a1 = 0, a2 = 0;
  const num = (sheet: ExcelJS.Worksheet, addr: string) => val(sheet, addr) ?? 0;

  beforeAll(async () => {
    const built = buildClaimWorkbook(claim3, ctx);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await built.xlsx.writeBuffer()) as ArrayBuffer);
    d3 = book.getWorksheet(CLAIM_SHEET_DETAILS)!;
    d3.eachRow((row, n) => {
      const b = String(row.getCell("B").value ?? "");
      if (!a1 && b === "A1") a1 = n;
      if (!a2 && b === "A2") a2 = n;
    });
  });

  it("writes one numbered sub-row per period, labelled the way the client writes it", () => {
    expect(a1).toBeGreaterThan(0);
    expect(val(d3, `B${a1 + 1}`)).toBe(1);
    expect(val(d3, `C${a1 + 1}`)).toBe("Work Done: 17-23 Aug'26 - 1st Storey");
    expect(val(d3, `B${a1 + 2}`)).toBe(2);
    expect(val(d3, `C${a1 + 2}`)).toBe("Work Done: 01-15 Sep'26 - 1st Storey");
    // Two periods means two slots, then A2's zone header, then A2 — the same
    // shape as the client's sheet (A1 row 16, subs 17-19, zone 20, A2 row 21).
    expect(a2).toBe(a1 + 2 + 1 + 1);
  });

  it("puts an earlier period in Previous and this claim's period in Current", () => {
    expect(num(d3, `J${a1 + 1}`)).toBe(107.64);
    expect(num(d3, `K${a1 + 1}`)).toBe(0);
    expect(num(d3, `J${a1 + 2}`)).toBe(0);
    expect(num(d3, `K${a1 + 2}`)).toBe(250);
  });

  it("sums the sub-rows on the item row, over the full span", () => {
    expect(formulaOf(d3, `J${a1}`)).toBe(`SUM(J${a1 + 1}:J${a1 + 2})`);
    expect(formulaOf(d3, `K${a1}`)).toBe(`SUM(K${a1 + 1}:K${a1 + 2})`);
    expect(num(d3, `J${a1}`)).toBe(107.64);
    expect(num(d3, `K${a1}`)).toBe(250);
    expect(num(d3, `L${a1}`)).toBeCloseTo(357.64, 2);
    expect(num(d3, `N${a1}`)).toBeCloseTo(12500, 2);
  });

  it("still holds amounts off the sub-rows, so the subtotal cannot double-count", () => {
    for (const r of [a1 + 1, a1 + 2]) {
      for (const col of ["L", "M", "N", "O", "V", "W", "X", "Y"]) {
        expect(val(d3, `${col}${r}`) ?? "", `${col}${r} is empty`).toBe("");
      }
    }
    let subtotalRow = 0;
    d3.eachRow((row, n) => {
      if (String(row.getCell(2).value ?? "").startsWith("Subtotal — Sub-Contract Works")) subtotalRow = n;
    });
    expect(num(d3, `M${subtotalRow}`)).toBeCloseTo(5382, 2);
    expect(num(d3, `N${subtotalRow}`)).toBeCloseTo(12500, 2);
  });

  it("leaves a line with no breakdown exactly as it prints today", () => {
    // One slot, numbered 1, with no label and zero quantities — unchanged from
    // before item 2, so existing claims re-export byte-for-byte as they did.
    expect(val(d3, `B${a2 + 1}`)).toBe(1);
    expect(val(d3, `C${a2 + 1}`)).toBe("");
    expect(val(d3, `J${a2 + 1}`) ?? 0).toBe(0);
    expect(val(d3, `K${a2 + 1}`) ?? 0).toBe(0);
    expect(formulaOf(d3, `J${a2}`)).toBe(`SUM(J${a2 + 1}:J${a2 + 1})`);
  });
});
