import { describe, expect, it } from "vitest";
import {
  buildInvoiceDraft,
  buildQuoteBlocks,
  buildRetentionSchedule,
  computeInvoiceTotals,
  defaultRetentionRows,
  invoiceNumberFor,
  spellAmount,
  splitAddress,
  tallyWithCertificate,
  workDoneLabel,
  type InvoiceClaimRow,
  type InvoiceDraft,
  type InvoiceProjectRow,
} from "@/lib/invoiceDocument";
import { buildInvoiceWorkbook, INVOICE_SHEET, RETENTION_SHEET } from "@/lib/invoiceExcel";

// Accounts' sample: PC1 certified 1,000, PC2 9,000 (cum 10,000), 10% retention.
const templateDraft = (): InvoiceDraft => ({
  invoiceNumber: "320014/2026/09",
  invoiceDate: "2026-09-16",
  clientName: "SATO KOGYO (S) PTE LTD",
  addressLines: ["149 ROCHOR ROAD #04-14/15", "FU LU SHOU COMPLEX", "SINGAPORE 188425"],
  attn: "Ms Teoh / Account Dept",
  email: "tpeneey@satokogyo.com.sg",
  site: "PROJECT 810C SENGKANG LRT DEPOT EXTENSION",
  jobRef: "FE23012",
  paymentCert: "",
  claimNos: "",
  paymentTerms: "30 DAYS",
  customerPo: "",
  quoteBlocks: [
    { kind: "main", quoteRef: "Q23336G/112023//JL", items: [{ label: "ITEM 1", text: "Floor Finishes", include: true }] },
    { kind: "vo", quoteRef: "Q24151G/062024//JL", items: [{ label: "ITEM 1", text: "Supply Labour & Equipment To Roughen The Existing Concrete Slab", include: true }] },
  ],
  workDone: "Jul'26",
  cumCertified: 10000,
  retentionPct: 10,
  retentionCapPct: null,
  contractSum: null,
  retentionOverride: null,
  paymentReceived: 900,
  gstPct: 9,
  retentionRows: [
    { label: "Payment Certificate No.1", certified: 1000, retention: 100 },
    { label: "Payment Certificate No.2", certified: 9000, retention: 900 },
  ],
});

describe("invoice totals (Accounts' template)", () => {
  it("reproduces the template's page 1", () => {
    const t = computeInvoiceTotals(templateDraft());
    expect(t.retention).toBe(1000);
    expect(t.totalAmount).toBe(8100);
    expect(t.gst).toBe(729);
    expect(t.totalDue).toBe(8829);
    expect(spellAmount(t.totalDue)).toBe("Eight Thousand Eight Hundred Twenty Nine Only");
  });

  it("reproduces page 2 (payment claims per certificate)", () => {
    const s = buildRetentionSchedule(templateDraft().retentionRows);
    expect(s.rows.map((r) => r.payment)).toEqual([900, 8100]);
    expect(s.total).toEqual({ certified: 10000, retention: 1000, payment: 9000 });
  });

  it("caps retention at the % of contract sum", () => {
    const d = { ...templateDraft(), retentionCapPct: 5, contractSum: 15000, retentionRows: [] }; // cap 750
    const t = computeInvoiceTotals(d);
    expect(t.retentionCap).toBe(750);
    expect(t.retention).toBe(750);
    expect(t.totalAmount).toBe(8350);
  });

  it("takes page 1's retention from the page-2 column so both pages agree", () => {
    const d = { ...templateDraft(), retentionRows: [
      { label: "Payment Certificate No.1", certified: 1000, retention: 100.01 },
      { label: "Payment Certificate No.2", certified: 9000, retention: 899.98 },
    ] };
    expect(computeInvoiceTotals(d).retention).toBe(999.99);
  });

  it("honours an override from the certificate", () => {
    expect(computeInvoiceTotals({ ...templateDraft(), retentionOverride: 950 }).totalAmount).toBe(8150);
  });
});

describe("helpers", () => {
  it("spells cents", () => {
    expect(spellAmount(12637.24)).toBe("Twelve Thousand Six Hundred Thirty Seven and Cents Twenty Four Only");
    expect(spellAmount(1000000)).toBe("One Million Only");
    expect(spellAmount(115)).toBe("One Hundred Fifteen Only");
  });
  it("numbers invoices <running>/<YYYY>/<MM>", () => {
    expect(invoiceNumberFor(320015, "2026-09-30")).toBe("320015/2026/09");
  });
  it("labels the work month as the month before the claim", () => {
    expect(workDoneLabel("2026-09-04")).toBe("Aug'26");
    expect(workDoneLabel("2026-01-10")).toBe("Dec'25");
  });
  it("splits addresses into at most three lines", () => {
    expect(splitAddress("7 Kung Chong Road, Singapore 159144")).toEqual(["7 Kung Chong Road", "Singapore 159144"]);
    expect(splitAddress("149 Rochor Road, #04-14/15, Fu Lu Shou Complex, Singapore 188425")).toEqual([
      "149 Rochor Road, #04-14/15", "Fu Lu Shou Complex", "Singapore 188425",
    ]);
  });
  it("derives retention rows from net certified amounts, respecting the cap", () => {
    expect(defaultRetentionRows([{ claimNo: 1, net: 900 }, { claimNo: 2, net: 8100 }], 10, null)).toEqual([
      { label: "Payment Certificate No.1", certified: 1000, retention: 100 },
      { label: "Payment Certificate No.2", certified: 9000, retention: 900 },
    ]);
    const capped = defaultRetentionRows([{ claimNo: 1, net: 900 }, { claimNo: 2, net: 8100 }], 10, 500);
    expect(capped[1]).toEqual({ label: "Payment Certificate No.2", certified: 8500, retention: 400 });
  });
  it("rounds per row so a capped column adds up to the cap exactly (F23012, 6 Oct)", () => {
    // three rows whose unrounded retentions each end in .xx5 — summing rounded values must still hit the cap
    const rows = defaultRetentionRows([{ claimNo: 1, net: 100.05 }, { claimNo: 2, net: 100.05 }, { claimNo: 3, net: 100.05 }, { claimNo: 4, net: 50 }], 10, 33.35);
    const s = buildRetentionSchedule(rows);
    expect(s.total.retention).toBe(33.35);
    rows.forEach((r, i) => expect(s.rows[i].payment).toBe([100.05, 100.05, 100.05, 50][i]));
  });
});

// E25077 (HPC Builders): claim 1 certified $4,500 net (= $5,000 gross), claim 2 certified later.
const project: InvoiceProjectRow = {
  project_code: "E25077",
  name: "STA Singapore Phase 1, Tuas South Avenue 12",
  quotation_ref: "Q26259-2E/082026/186/WF",
  contract_value: 111696,
  total_contract_value: 111696,
  retention_pct: 10,
  retention_cap_pct: 5,
  payment_terms_days: 30,
  client_po: null,
  contact_email: "chiahian@hpc.sg",
};
const claim = (no: number, certified: number | null, claimDate: string): InvoiceClaimRow => ({
  id: `c${no}`,
  claim_no: no,
  claim_date: claimDate,
  project_code: "E25077",
  project_name: project.name,
  client_name: "HPC Builders Pte Ltd",
  client_address: "7 Kung Chong Road, Singapore 159144",
  contact_person: "Chan Chia Hian, Jason",
  amount: null,
  certified_amount: certified,
  payment_terms: no === 1 ? "30 days" : null,
  po_ref: null,
});

describe("buildInvoiceDraft (E25077)", () => {
  const lines = [
    { section: "A", quotation_ref: "Q26259-2E/082026/186/WF", seq: 1, description: "To Floor\nSurface preparation by Mechanical Grinding" },
    { section: "A", quotation_ref: "Q26259-2E/082026/186/WF", seq: 2, description: "To Floor - Confine Space\nSurface preparation" },
    { section: "A", quotation_ref: "Q26259-2E/082026/186/WF", seq: 9, description: "To Floor\nagain in another zone" },
    { section: "B", quotation_ref: "VO-01", seq: 20, description: "Additional screed" },
  ];

  it("invoices claim 1 for its certified amount", () => {
    const d = buildInvoiceDraft({
      claim: claim(1, 4500, "2026-09-04"),
      project,
      projectClaims: [claim(1, 4500, "2026-09-04"), claim(2, null, "2026-09-18")],
      lines,
      nextRunningNo: 320015,
      today: "2026-09-30",
    });
    expect(d.invoiceNumber).toBe("320015/2026/09");
    expect(d.cumCertified).toBe(5000);
    expect(d.paymentReceived).toBe(0);
    expect(d.workDone).toBe("Aug'26");
    expect(d.paymentTerms).toBe("30 DAYS");
    expect(d.claimNos).toBe("01");
    const t = computeInvoiceTotals(d);
    expect(t.retention).toBe(500);
    expect(t.totalAmount).toBe(4500);
    expect(t.gst).toBe(405);
    expect(tallyWithCertificate(d, 4500).ok).toBe(true);
  });

  it("invoices claim 2 net of what claim 1 already billed", () => {
    const d = buildInvoiceDraft({
      claim: claim(2, 11250, "2026-09-18"),
      project,
      projectClaims: [claim(1, 4500, "2026-09-04"), claim(2, 11250, "2026-09-18")],
      lines,
      nextRunningNo: 320016,
      today: "2026-10-02",
    });
    expect(d.retentionRows.map((r) => r.certified)).toEqual([5000, 12500]);
    expect(d.paymentReceived).toBe(4500);
    const t = computeInvoiceTotals(d);
    expect(t.cumCertified).toBe(17500);
    expect(t.retention).toBe(1750);
    expect(t.totalAmount).toBe(11250);
    expect(d.invoiceNumber).toBe("320016/2026/10");
  });

  it("fills the To block, PO and certificate no. from the claims (Accounts, 6 Oct)", () => {
    const bare = { ...claim(2, 11250, "2026-09-18"), client_address: null, contact_person: null };
    const c1 = { ...claim(1, 4500, "2026-09-04"), wo_po_ref: "PO-HPC-0012" };
    const d = buildInvoiceDraft({ claim: bare, project, projectClaims: [c1, bare], lines, nextRunningNo: 1, today: "2026-10-02" });
    expect(d.addressLines).toEqual(["7 Kung Chong Road", "Singapore 159144"]);
    expect(d.attn).toBe("Chan Chia Hian, Jason");
    expect(d.customerPo).toBe("PO-HPC-0012");
    expect(d.paymentCert).toBe("2");
    const nil = { ...c1, wo_po_ref: "NIL — LOA pending" };
    expect(buildInvoiceDraft({ claim: bare, project, projectClaims: [nil, bare], lines, nextRunningNo: 1 }).customerPo).toBe("");
  });

  it("takes one bold subtitle per heading, VO quotations as their own block", () => {
    const blocks = buildQuoteBlocks(project, lines);
    expect(blocks.map((b) => [b.kind, b.quoteRef, b.items.map((i) => i.text)])).toEqual([
      ["main", "Q26259-2E/082026/186/WF", ["To Floor", "To Floor - Confine Space"]],
      ["vo", "VO-01", ["Additional screed"]],
    ]);
  });
});

describe("buildInvoiceWorkbook", () => {
  it("writes both pages with the template's figures", () => {
    const wb = buildInvoiceWorkbook(templateDraft());
    const inv = wb.getWorksheet(INVOICE_SHEET)!;
    const ret = wb.getWorksheet(RETENTION_SHEET)!;
    expect(inv.getCell("B13").value).toBe("TAX INVOICE");
    expect(inv.getCell("K13").value).toBe("320014/2026/09");
    expect(inv.getCell("C15").value).toBe("SATO KOGYO (S) PTE LTD");
    const values: Record<string, unknown> = {};
    inv.eachRow((row) => {
      const label = row.getCell("B").value;
      const k = row.getCell("K").value as { result?: number } | number | null;
      if (typeof label === "string") values[label] = typeof k === "object" && k ? k.result : k;
    });
    expect(values["Total Value of Certified"]).toBe(10000);
    expect(values["Less: 10% Retention"]).toBe(-1000);
    expect(values["Less: Payment Received"]).toBe(-900);
    expect(values["Total Amount"]).toBe(8100);
    expect(values["Total Balance Due for this Invoice"]).toBe(8829);
    let spelled = "";
    inv.eachRow((row) => { if (row.getCell("B").value === "SGD:") spelled = String(row.getCell("C").value); });
    expect(spelled).toBe("Eight Thousand Eight Hundred Twenty Nine Only");
    expect(ret.getCell("B14").value).toBe("Accumulative Retention");
    expect(ret.getCell("B29").value).toBe("Payment Certificate No.1");
    expect(inv.pageSetup.printArea).toMatch(/^A1:K\d+$/);
    // page-1 retention is a live link to the page-2 total; money is right-aligned
    const retRow = [...Array(80).keys()].find((r) => inv.getCell(`B${r + 1}`).value === "Less: 10% Retention")! + 1;
    expect((inv.getCell(`K${retRow}`).value as { formula: string }).formula).toBe("'Retention'!H32");
    expect(ret.getCell("H32").value).toMatchObject({ formula: "SUM(H29:H30)" });
    expect(inv.getCell(`K${retRow}`).alignment?.horizontal).toBe("right");
  });

  it("holds the footer to the foot of the A4 page", () => {
    const inv = buildInvoiceWorkbook(templateDraft()).getWorksheet(INVOICE_SHEET)!;
    const last = Number(inv.pageSetup.printArea!.split(":")[1].slice(1));
    let rowsPt = 0;
    for (let r = 1; r <= last; r++) rowsPt += inv.getRow(r).height ?? 15;
    let widthPt = 0;
    for (let c = 1; c <= 11; c++) widthPt += Math.round((inv.getColumn(c).width ?? 8.43) * 7 + 5) * 0.75;
    const pagePt = ((11.69 - 0.7) * 72 * widthPt) / ((8.27 - 1.02) * 72);
    expect(rowsPt / pagePt).toBeGreaterThan(0.97);
    expect(rowsPt / pagePt).toBeLessThanOrEqual(1);
  });
});
