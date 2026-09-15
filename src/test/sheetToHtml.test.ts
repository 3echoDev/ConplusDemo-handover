import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import master from "./fixtures/claim_master_e25077.json";
import { buildClaimWorkbook, CLAIM_SHEET_COVER, CLAIM_SHEET_DETAILS } from "@/lib/claimExcel";
import { formatCellValue, worksheetToHtml } from "@/lib/sheetToHtml";
import type { ClaimDocContext } from "@/lib/claimDocument";
import type { Claim, ClaimLine } from "@/data/sampleData";

// Same E25077 claim 01 the Excel test builds, so the print HTML is checked
// against the client-corrected figures.
const items = master.details.items as { pgRef: string; description: string; unit: string; qty: number; rate: number; currQty: number; remarks: string | null; row: number }[];
const zones = master.details.zones as { row: number; text: string }[];
const zoneFor = (row: number) => [...zones].reverse().find((z) => z.row < row)?.text ?? "";
const lines: ClaimLine[] = items.map((it, i) => {
  const cum = Math.round(it.currQty * it.rate * 100) / 100;
  return {
    id: `l${i}`, claimId: "c1", section: "A", quotationRef: "Q26259-2E/082026/186/WF", seq: i + 1, pgRef: it.pgRef, zone: zoneFor(it.row),
    description: it.description, unit: it.unit, qty: it.qty, rate: it.rate, contractAmount: it.qty * it.rate, prevQty: 0, prevAmount: 0,
    currQty: it.currQty, currAmount: cum, cumQty: it.currQty, cumAmount: cum, verifiedQty: null, verifiedAmount: null, remarks: it.remarks ?? "",
  };
});
const workDone = lines.reduce((s, l) => s + (l.cumAmount ?? 0), 0);
const claim: Claim = {
  id: "c1", claimNumber: "CLM-E25077-1", projectId: "p1", projectCode: "E25077", projectName: "STA Singapore Phase 1 at Tuas South Avenue 12 (Building H92)",
  amount: Math.round(workDone * 0.9 * 100) / 100, claimNo: 1, totalClaim: null, certifiedAmount: null, remarks: "", gst: null, totalAmount: null, poRef: "", woRef: "", doRef: "",
  paymentTerms: "30 days", firstReleasePct: null, secondReleasePct: null, advancePayment: null, advanceRecovery: null, clientName: "HPC Builders Pte Ltd",
  clientAddress: "7 Kung Chong Road\nSingapore 159144", contactPerson: "Chan Chia Hian, Jason", contactNumber: "6227 7927 (ext. 6021)", submittedDate: "2026-09-08",
  claimDate: "2026-09-04", isFinal: false, retentionAmount: null, retentionPct: 10, netAmount: null, status: "submitted",
  description: "Supply & Installation of Epoxy Coating to Floor, Wall & Ceiling at Building H92", lines,
};
const ctx: ClaimDocContext = { subContractSum: 111696, retentionPct: 10, retentionCapPct: 5, gstPct: 9, clientEmail: "chiahian@hpc.sg", preparedBy: "Hnin (QS)", authorisedBy: "Jensen Lim" };

describe("formatCellValue", () => {
  it("formats money, dashes for zero, percentages and dates like the sheet", () => {
    expect(formatCellValue(5382, '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)')).toBe("$ 5,382.00");
    expect(formatCellValue(0, '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)')).toBe("-");
    expect(formatCellValue(-538.2, "#,##0.00")).toBe("-538.20");
    expect(formatCellValue(0.0482, "0.00%")).toBe("4.82%");
    expect(formatCellValue(new Date(2026, 8, 4), "dd/mmm/yyyy")).toBe("04/Sep/2026");
    expect(formatCellValue(new Date(2026, 7, 31), "mm/yyyy")).toBe("08/2026");
    expect(formatCellValue({ formula: "F47+F48", result: 111696 } as ExcelJS.CellFormulaValue, "#,##0.00")).toBe("111,696.00");
    expect(formatCellValue(null)).toBe("");
  });
});

describe("worksheetToHtml on the claim workbook", () => {
  const wb = buildClaimWorkbook(claim, ctx);
  const cover = wb.getWorksheet(CLAIM_SHEET_COVER)!;
  const details = wb.getWorksheet(CLAIM_SHEET_DETAILS)!;

  it("renders the cover page with its titles, merged boxes, yellow input cells and the ladder totals", () => {
    const html = worksheetToHtml(cover, { range: "A1:J63", replace: { "[ Company Logo ]": "" } });
    expect(html).toContain("PROGRESS CLAIM");
    expect(html).toContain("PAYMENT CLAIM PARTICULARS");
    expect(html).toContain("HPC Builders Pte Ltd");
    expect(html).toContain("Chan Chia Hian, Jason");
    expect(html).toContain("Claim Amount incl. GST");
    expect(html).toMatch(/colspan="\d+"/);
    expect(html).toContain("background:#FFFF99"); // manual-input cells stay yellow
    expect(html).toContain("111,696.00"); // sub-contract sum
    expect(html).toContain("5,382.00"); // work done
    expect(html).not.toContain("[ Company Logo ]");
  });

  it("renders the details with rows 1–12 as a repeating header and stops at column Q", () => {
    const html = worksheetToHtml(details, { range: "B1:Q80", titleRows: "1:12" });
    expect(html).toContain("<thead>");
    expect(html).toContain("SUB-CONTRACT SUM");
    expect(html).toContain("CUMULATIVE CLAIMED");
    expect(html).toContain("A    SUB-CONTRACT WORKS".replace(/\s+/g, " ").split(" ")[0]);
    expect(html).toContain("Subtotal — Sub-Contract Works (A)");
    expect(html).toContain("TOTAL — SUB-CONTRACT &amp; VARIATION WORKS (A + B)");
    expect(html).toContain("H92 ZONE 28 - WST");
    expect(html).not.toContain("Verified"); // internal verification columns are outside the print area
  });
});
