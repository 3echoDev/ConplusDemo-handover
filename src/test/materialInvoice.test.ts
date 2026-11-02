import { describe, expect, it } from "vitest";
import type { WorksOrder } from "@/data/sampleData";
import { spellAmount } from "@/lib/invoiceDocument";
import { buildMaterialInvoiceDraft, computeMaterialTotals, lineDescription, materialLinesFromWO } from "@/lib/materialInvoiceDocument";
import { buildMaterialInvoiceWorkbook, MATERIAL_SHEET } from "@/lib/materialInvoiceExcel";
import { PAYNOW_QR_MARKER } from "@/lib/invoiceExcel";

// Accounts' sample ("Invoice - 2nd Format Request", 2 Nov 2026): 310266/2026/04 to
// GA Construction, 1 set StoPox WL100 (RAL 7040) @ 180 → 180 + 16.20 GST = 196.20.
const wo: WorksOrder = {
  id: "wo-1",
  woNumber: "0001-2026",
  projectId: "p-1",
  projectCode: "E20004",
  clientName: "GA CONSTRUCTION PTE LTD",
  jobNo: "E20004",
  sales: "JL",
  projectIc: "",
  siteAddress: "TELOK BLANGAH ROAD",
  quotationRef: "E20004",
  siteContact: "",
  siteContactNumber: "",
  contactPerson: "Ms Kai Qin / Accounts Department",
  contactNumber: "+65 6853 3297",
  status: "completed",
  remarks: "",
  areas: [{
    id: "a1", seq: 1, areaName: "Level 2", areaSqm: null, ralColour: "RAL 7040", prepNote: "",
    lines: [
      { id: "l1", areaId: "a1", seq: 1, description: "StoPox WL100", colour: "RAL 7040", dosage: null, dosageUnit: "", packingSize: 30, packingUnit: "30kg/set", requiredQty: 1, orderQty: null, unitPrice: 180, parentLineId: null, qtyUnit: "kg", isMixComponent: false, remarks: "" },
      { id: "l2", areaId: "a1", seq: 2, description: "Hardener B", colour: "", dosage: null, dosageUnit: "", packingSize: null, packingUnit: "", requiredQty: 1, orderQty: null, unitPrice: null, parentLineId: null, qtyUnit: "kg", isMixComponent: true, remarks: "" },
    ],
  }],
};

describe("material-supply invoice (Accounts' 2nd format)", () => {
  it("takes the WO's order lines, mix components excluded, with the colour in the description", () => {
    const lines = materialLinesFromWO(wo);
    expect(lines).toEqual([{ description: "StoPox WL100 (RAL 7040)", unitPrice: 180, qty: 1, unit: "set" }]);
    expect(lineDescription({ description: "StoPox WL100 RAL 7040", colour: "RAL 7040" })).toBe("StoPox WL100 RAL 7040");
  });

  it("reproduces the sample's figures and words", () => {
    const d = buildMaterialInvoiceDraft({ wo, project: { payment_terms_days: null, client_po: "0001-2026" }, nextRunningNo: 310266, today: "2026-04-01" });
    expect(d.invoiceNumber).toBe("310266/2026/04");
    expect(d.poNo).toBe("0001-2026");
    expect(d.woNo).toBe("0001-2026");
    expect(d.jobRef).toBe("E20004");
    expect(d.attn).toBe("Ms Kai Qin / Accounts Department");
    expect(d.tel).toBe("+65 6853 3297");
    expect(d.site).toBe("TELOK BLANGAH ROAD");
    const t = computeMaterialTotals(d);
    expect(t).toEqual({ lineTotals: [180], subTotal: 180, gst: 16.2, totalDue: 196.2 });
    expect(spellAmount(t.totalDue)).toBe("One Hundred Ninety Six and Cents Twenty Only");
  });

  it("writes the one-page sheet in Accounts' layout", () => {
    const d = buildMaterialInvoiceDraft({ wo, project: null, nextRunningNo: 310266, today: "2026-04-01" });
    d.paymentTerms = "COD";
    d.doNo = "0001-2026";
    const ws = buildMaterialInvoiceWorkbook(d, { printMarkers: true }).getWorksheet(MATERIAL_SHEET)!;
    expect(ws.getCell("B13").value).toBe("TAX INVOICE");
    expect(ws.getCell("K13").value).toBe("310266/2026/04");
    expect(ws.getCell("C15").value).toBe("GA CONSTRUCTION PTE LTD");
    expect(ws.getCell("H17").value).toBe("PO NO:");
    expect(ws.getCell("H18").value).toBe("WO NO:");
    expect(ws.getCell("K19").value).toBe("0001-2026"); // DO NO
    expect(ws.getCell("H20").value).toBe("JOB REF:");
    expect(ws.getCell("K21").value).toBe("COD");
    expect(ws.getCell("B20").value).toBe("Attn:");
    expect(ws.getCell("B21").value).toBe("Tel:");
    expect(ws.getCell("B24").value).toBe("Site/Project:");
    expect(ws.getCell("K24").border?.bottom?.style).toBe("thin");
    expect(ws.getCell("B26").value).toBe("S/NO");
    expect(ws.getCell("C26").value).toBe("DESCRIPTION");
    expect(ws.getCell("K26").value).toBe("TOTAL");
    expect(ws.getCell("C28").value).toBe("Supply of Material:");
    expect(ws.getCell("B29").value).toBe(1);
    expect(ws.getCell("C29").value).toBe("StoPox WL100 (RAL 7040)");
    expect(ws.getCell("G29").value).toBe(180);
    expect(ws.getCell("I29").value).toBe("set");
    expect(ws.getCell("K29").value).toMatchObject({ result: 180 });
    expect(ws.getCell("H51").value).toBe("Sub-Total");
    expect(ws.getCell("K51").value).toMatchObject({ formula: "SUM(K29:K29)", result: 180 });
    expect(ws.getCell("K52").value).toMatchObject({ result: 16.2 });
    expect(ws.getCell("G53").value).toBe("Total Balance Due for this Invoice");
    expect(ws.getCell("K53").value).toMatchObject({ result: 196.2 });
    expect(ws.getCell("C55").value).toBe("One Hundred Ninety Six and Cents Twenty Only");
    const col = (c: string) => [...Array(90).keys()].map((r) => ws.getCell(`${c}${r + 1}`).value);
    expect(col("B")).toContain("Payment Modes");
    expect(col("B")).toContain(PAYNOW_QR_MARKER);
    expect(col("B")).toContain("Page 1 of 1");
    expect(ws.pageSetup.printArea).toMatch(/^A1:K\d+$/);
  });
});
