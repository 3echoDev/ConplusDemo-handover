import type { Claim, ClaimLine } from "@/data/sampleData";
import { exportRecordToExcel, type RecordSection } from "@/lib/exportData";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-SG", { style: "currency", currency: "SGD" });

const qtyStr = (n: number | null | undefined) => (n == null ? "-" : String(n));

/**
 * Context the claim document needs from the project (the retention TERMS and the
 * sub-contract sum that the cap is a percentage of). These live on the project,
 * not the claim, so they're passed in by the caller.
 */
export interface ClaimDocContext {
  subContractSum: number | null; // projects.contract_value — the cap base
  retentionPct: number | null; // projects.retention_pct (e.g. 10)
  retentionCapPct: number | null; // projects.retention_cap_pct (e.g. 5)
  gstPct?: number; // default 9
}

export interface ClaimTotals {
  workDone: number; // cumulative value of work done this claim (section A + B)
  retention: number; // retention held (capped)
  retentionCapValue: number | null; // the 5%-of-sum ceiling, for display
  advancePayment: number;
  advanceRecovery: number;
  firstRelease: number;
  secondRelease: number;
  netAfterRetention: number;
  previouslyCertified: number; // sum of prev_amount across lines
  claimAmount: number; // this period's claim (net - previous)
  gst: number;
  claimInclGst: number;
}

/**
 * Compute the payment-claim summary the way the Cover page does:
 *  work done → less retention (pct, capped at cap% of sub-contract sum)
 *  → net → less previously certified → claim amount → + GST.
 */
export function computeClaimTotals(claim: Claim, ctx: ClaimDocContext): ClaimTotals {
  const lines = claim.lines ?? [];
  const workDone = lines.reduce((s, l) => s + (l.cumAmount ?? 0), 0);
  const previouslyCertified = lines.reduce((s, l) => s + (l.prevAmount ?? 0), 0);

  const retPct = ctx.retentionPct ?? 10;
  const capPct = ctx.retentionCapPct ?? 5;
  const rawRetention = workDone * (retPct / 100);
  const capValue = ctx.subContractSum != null ? ctx.subContractSum * (capPct / 100) : null;
  const retention = capValue != null ? Math.min(rawRetention, capValue) : rawRetention;

  const advancePayment = claim.advancePayment ?? 0;
  const advanceRecovery = claim.advanceRecovery ?? 0;
  const firstRelease = workDone * ((claim.firstReleasePct ?? 0) / 100);
  const secondRelease = workDone * ((claim.secondReleasePct ?? 0) / 100);

  const netAfterRetention =
    workDone - retention + advancePayment - advanceRecovery + firstRelease + secondRelease;
  const claimAmount = netAfterRetention - previouslyCertified;

  const gstPct = ctx.gstPct ?? 9;
  const gst = claimAmount * (gstPct / 100);
  const claimInclGst = claimAmount + gst;

  return {
    workDone,
    retention,
    retentionCapValue: capValue,
    advancePayment,
    advanceRecovery,
    firstRelease,
    secondRelease,
    netAfterRetention,
    previouslyCertified,
    claimAmount,
    gst,
    claimInclGst,
  };
}

/** Group lines by section (A / B), each section's lines ordered by seq. */
function bySection(lines: ClaimLine[]): { A: ClaimLine[]; B: ClaimLine[] } {
  const A = lines.filter((l) => l.section === "A").sort((a, b) => a.seq - b.seq);
  const B = lines.filter((l) => l.section === "B").sort((a, b) => a.seq - b.seq);
  return { A, B };
}

function sectionRows(lines: ClaimLine[]): string {
  return lines
    .map(
      (l, i) => `
      <tr>
        <td class="c">${escapeHtml(l.pgRef || String(i + 1))}</td>
        <td>${escapeHtml(l.description)}</td>
        <td class="c">${escapeHtml(l.unit || "")}</td>
        <td class="r">${qtyStr(l.qty)}</td>
        <td class="r">${l.rate != null ? money(l.rate) : "—"}</td>
        <td class="r">${qtyStr(l.prevQty)}</td>
        <td class="r">${qtyStr(l.currQty)}</td>
        <td class="r">${qtyStr(l.cumQty)}</td>
        <td class="r">${money(l.cumAmount)}</td>
        <td class="r verified">${money(l.verifiedAmount)}</td>
        <td class="r diff">${
          l.verifiedAmount != null && l.cumAmount != null
            ? money(l.verifiedAmount - l.cumAmount)
            : "—"
        }</td>
      </tr>`,
    )
    .join("");
}

function sectionBlock(title: string, quotationRef: string, lines: ClaimLine[]): string {
  if (lines.length === 0) return "";
  const subtotal = lines.reduce((s, l) => s + (l.cumAmount ?? 0), 0);
  const verifiedSub = lines.reduce((s, l) => s + (l.verifiedAmount ?? 0), 0);
  return `
    <div class="sec-head">${escapeHtml(title)}${
      quotationRef ? `<span class="qref">Quotation Ref: ${escapeHtml(quotationRef)}</span>` : ""
    }</div>
    <table>
      <thead>
        <tr>
          <th>S/No</th><th>Description</th><th>Unit</th><th>Qty</th><th>Rate</th>
          <th>Prev</th><th>Curr</th><th>Cum Qty</th><th>Claimed $</th><th>Verified $</th><th>Diff $</th>
        </tr>
      </thead>
      <tbody>
        ${sectionRows(lines)}
        <tr class="subtotal">
          <td colspan="8" class="r">Subtotal</td>
          <td class="r">${money(subtotal)}</td>
          <td class="r verified">${money(verifiedSub)}</td>
          <td class="r diff">${money(verifiedSub - subtotal)}</td>
        </tr>
      </tbody>
    </table>`;
}

export function buildClaimHtml(claim: Claim, ctx: ClaimDocContext): string {
  const lines = claim.lines ?? [];
  const { A, B } = bySection(lines);
  const t = computeClaimTotals(claim, ctx);
  const aRef = A.find((l) => l.quotationRef)?.quotationRef ?? "";
  const bRef = B.find((l) => l.quotationRef)?.quotationRef ?? "";

  // Payment-claim summary rows (mirrors the Cover page ladder)
  const summaryRow = (label: string, value: string, opts?: { strong?: boolean; note?: string }) =>
    `<tr${opts?.strong ? ' class="strong"' : ""}>
      <td>${escapeHtml(label)}${opts?.note ? ` <small>${escapeHtml(opts.note)}</small>` : ""}</td>
      <td class="r">${value}</td>
    </tr>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(claim.claimNumber)} — Progress Claim</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #111; padding-bottom: 10px; }
  .co { font-size: 18px; font-weight: 800; letter-spacing: .8px; }
  .co small { display: block; font-size: 9px; font-weight: 400; letter-spacing: 2.5px; color: #555; }
  .title { font-size: 20px; font-weight: 700; text-align: right; }
  .title small { display: block; font-size: 11px; font-weight: 600; color: #555; letter-spacing: 1px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 14px 0; }
  .party { border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; }
  .party h4 { margin: 0 0 4px; font-size: 9px; text-transform: uppercase; letter-spacing: .6px; color: #555; }
  .party p { margin: 1px 0; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 28px; margin: 8px 0 14px; }
  .meta div { display: flex; justify-content: space-between; border-bottom: 1px dotted #bbb; padding: 3px 0; }
  .meta span { color: #555; font-weight: 600; text-transform: uppercase; font-size: 9px; }
  .sec-title { font-size: 13px; font-weight: 700; margin: 20px 0 8px; border-bottom: 2px solid #111; padding-bottom: 4px; }
  .sec-head { background: #f0f0f0; border: 1px solid #999; border-bottom: none; padding: 6px 8px;
              font-size: 12px; font-weight: 700; display: flex; justify-content: space-between; align-items: baseline; }
  .qref { font-size: 9px; font-weight: 600; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #fafafa; border: 1px solid #999; padding: 4px 3px; font-size: 8px; text-transform: uppercase; }
  td { border: 1px solid #999; padding: 4px 3px; font-size: 10px; }
  .c { text-align: center; } .r { text-align: right; }
  .verified { background: #f3f8f3; } .diff { background: #fbf6f3; }
  tr.subtotal td { font-weight: 700; background: #f7f7f7; }
  .summary { margin-top: 8px; width: 340px; margin-left: auto; }
  .summary table { border: none; }
  .summary td { border: none; border-bottom: 1px dotted #ccc; padding: 4px 2px; font-size: 11px; }
  .summary tr.strong td { border-bottom: 2px solid #111; font-weight: 800; font-size: 12px; }
  .foot { margin-top: 18px; font-size: 9px; color: #888; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <div class="head">
    <div class="co">CONPLUS RESOURCES PTE LTD<small>Protective Coatings · Flooring · Waterproofing</small></div>
    <div class="title">PROGRESS CLAIM<small>${escapeHtml(claim.claimNumber)}${
      claim.claimNo != null ? ` · Claim No. ${claim.claimNo}` : ""
    }</small></div>
  </div>

  <div class="parties">
    <div class="party">
      <h4>To (Main Contractor / Respondent)</h4>
      <p><b>${escapeHtml(claim.clientName || "—")}</b></p>
      <p>${escapeHtml(claim.clientAddress || "")}</p>
      <p>${escapeHtml(claim.contactPerson || "")}${
        claim.contactNumber ? ` · ${escapeHtml(claim.contactNumber)}` : ""
      }</p>
    </div>
    <div class="party">
      <h4>From (Claimant)</h4>
      <p><b>Conplus Resources Pte Ltd</b></p>
      <p>10 Admiralty Street #02-26, North Link Building, Singapore 757695</p>
      <p>qs@conplus.com.sg / contract@conplus.com.sg</p>
    </div>
  </div>

  <div class="meta">
    <div><span>Project</span><b>${escapeHtml(claim.projectName || "—")}</b></div>
    <div><span>Project Code</span><b>${escapeHtml(claim.projectCode || "—")}</b></div>
    <div><span>Claim Date</span><b>${escapeHtml(claim.submittedDate || "—")}</b></div>
    <div><span>Payment Terms</span><b>${escapeHtml(claim.paymentTerms || "—")}</b></div>
    <div><span>WO / PO Ref</span><b>${escapeHtml(claim.woRef || claim.poRef || "NIL")}</b></div>
    <div><span>Status</span><b style="text-transform:capitalize">${escapeHtml(claim.status)}</b></div>
  </div>

  <div class="sec-title">Payment Claim Particulars</div>
  ${sectionBlock("A · Sub-Contract Works", aRef, A)}
  ${sectionBlock("B · Variation Works", bRef, B)}

  <div class="summary">
    <table>
      ${summaryRow("Total Value of Work Done", money(t.workDone), { strong: true })}
      ${summaryRow(
        `Less: Retention`,
        money(-t.retention),
        {
          note:
            ctx.retentionPct != null
              ? `${ctx.retentionPct}%${
                  t.retentionCapValue != null
                    ? ` — capped at ${ctx.retentionCapPct}% of sub-contract sum (${money(
                        t.retentionCapValue,
                      )})`
                    : ""
                }`
              : undefined,
        },
      )}
      ${t.advancePayment ? summaryRow("Add: Advance Payment", money(t.advancePayment)) : ""}
      ${t.advanceRecovery ? summaryRow("Less: Recovery of Advance", money(-t.advanceRecovery)) : ""}
      ${t.firstRelease ? summaryRow("Add: Release of 1st Half Retention", money(t.firstRelease)) : ""}
      ${t.secondRelease ? summaryRow("Add: Release of 2nd Half Retention", money(t.secondRelease)) : ""}
      ${summaryRow("Net Amount", money(t.netAfterRetention))}
      ${summaryRow("Less: Amounts Previously Certified", money(-t.previouslyCertified))}
      ${summaryRow("Claim Amount", money(t.claimAmount), { strong: true })}
      ${summaryRow(`Add: GST (${ctx.gstPct ?? 9}%)`, money(t.gst))}
      ${summaryRow("Claim Amount incl. GST", money(t.claimInclGst), { strong: true })}
    </table>
  </div>

  <div class="foot">Retention applied at the sub-contract rate, capped per the sub-contract sum. Previous / current / cumulative per claim line.</div>
</body></html>`;

  return html;
}

export function printClaim(claim: Claim, ctx: ClaimDocContext): void {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.write(buildClaimHtml(claim, ctx));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

/** The same claim as a spreadsheet, keeping the template's two-section shape. */
export function exportClaimToExcel(claim: Claim, ctx: ClaimDocContext): void {
  const lines = claim.lines ?? [];
  const { A, B } = bySection(lines);
  const t = computeClaimTotals(claim, ctx);

  const lineTable = (ls: ClaimLine[]) => ({
    headers: [
      "S/No", "Description", "Unit", "Qty", "Rate",
      "Prev Qty", "Curr Qty", "Cum Qty", "Claimed $", "Verified $", "Diff $",
    ],
    rows: ls.map((l, i) => [
      l.pgRef || i + 1,
      l.description,
      l.unit,
      l.qty ?? "",
      l.rate ?? "",
      l.prevQty ?? "",
      l.currQty ?? "",
      l.cumQty ?? "",
      l.cumAmount ?? "",
      l.verifiedAmount ?? "",
      l.verifiedAmount != null && l.cumAmount != null ? l.verifiedAmount - l.cumAmount : "",
    ]),
  });

  const sections: RecordSection[] = [
    {
      heading: `Progress Claim ${claim.claimNumber}`,
      fields: [
        { label: "Project", value: claim.projectName },
        { label: "Project Code", value: claim.projectCode },
        { label: "Claim No", value: claim.claimNo ?? "" },
        { label: "Claim Date", value: claim.submittedDate },
        { label: "Client / Respondent", value: claim.clientName },
        { label: "Payment Terms", value: claim.paymentTerms },
        { label: "Status", value: claim.status },
      ],
    },
  ];
  if (A.length) sections.push({ heading: "A — Sub-Contract Works", table: lineTable(A) });
  if (B.length) sections.push({ heading: "B — Variation Works", table: lineTable(B) });
  sections.push({
    heading: "Payment Summary",
    fields: [
      { label: "Total Value of Work Done", value: t.workDone },
      { label: "Less: Retention", value: -t.retention },
      { label: "Net Amount", value: t.netAfterRetention },
      { label: "Less: Previously Certified", value: -t.previouslyCertified },
      { label: "Claim Amount", value: t.claimAmount },
      { label: "GST", value: t.gst },
      { label: "Claim Amount incl. GST", value: t.claimInclGst },
    ],
  });

  exportRecordToExcel(sections, `progress_claim_${claim.claimNumber}`);
}
