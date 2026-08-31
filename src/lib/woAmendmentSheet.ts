// Standalone, downloadable Works Order amendment sheet.
//
// This is the "Alternative" flow: instead of editing the WO on the deployed app,
// the user downloads a single self-contained HTML file, opens it in any browser,
// edits Order Qty and Unit Price inline (line / area / grand totals recompute
// live via an embedded script), then Prints / Saves to PDF. The file is a working
// copy — it has no connection back to the database.
import type { WorksOrder, WorksOrderLine } from "@/data/sampleData";
import { qtyUnitLabel, cleanRemark } from "@/lib/woDocument";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const attr = (n: number | null): string => (n != null ? String(n) : "");

export function buildWOAmendmentHtml(wo: WorksOrder): string {
  const areas = wo.areas
    .map((area) => {
      const renderRow = (l: WorksOrderLine, sn: number | null, child: boolean): string => {
        if (l.isMixComponent) {
          return `
          <tr class="sub">
            <td class="c"></td>
            <td class="desc">↳ ${escapeHtml(l.description)}</td>
            <td class="c">${escapeHtml(l.colour || "—")}</td>
            <td class="r">${l.dosage != null ? `${l.dosage} ${escapeHtml(l.dosageUnit)}` : "—"}</td>
            <td class="r">${l.packingSize != null ? `${l.packingSize} ${escapeHtml(l.packingUnit)}` : "—"}</td>
            <td class="c">mix</td>
            <td class="c">—</td>
            <td class="r total">—</td>
          </tr>`;
        }
        const unit = qtyUnitLabel(l, l.orderQty ?? l.requiredQty);
        const reqHint =
          l.requiredQty != null
            ? `<span class="hint">Award qty: ${l.requiredQty} ${escapeHtml(unit)}</span>`
            : "";
        return `
          <tr data-line>
            <td class="c">${sn ?? ""}</td>
            <td class="desc">${escapeHtml(l.description)}</td>
            <td class="c">${escapeHtml(l.colour || "—")}</td>
            <td class="r">${l.dosage != null ? `${l.dosage} ${escapeHtml(l.dosageUnit)}` : "—"}</td>
            <td class="r">${l.packingSize != null ? `${l.packingSize} ${escapeHtml(l.packingUnit)}` : "—"}</td>
            <td class="c"><input class="price" type="number" inputmode="decimal" step="0.01" min="0" value="${attr(l.unitPrice)}" placeholder="0.00" /></td>
            <td class="c">
              <div class="qtywrap"><input class="qty" type="number" inputmode="decimal" min="0" value="${attr(l.orderQty ?? l.requiredQty)}" placeholder="0" /><span class="uom">${escapeHtml(unit)}</span></div>
              ${reqHint}
            </td>
            <td class="r total">—</td>
          </tr>`;
      };

      const parents = area.lines.filter((l) => !l.parentLineId);
      const childrenOf = (id: string) => area.lines.filter((l) => l.parentLineId === id);
      const rows = parents
        .map((p, n) => [renderRow(p, n + 1, false), ...childrenOf(p.id).map((c) => renderRow(c, null, true))].join(""))
        .join("");

      return `
      <div class="area" data-area>
        <div class="area-head">
          <div><b>${escapeHtml(area.areaName)}</b>${area.ralColour ? `<span class="chip">${escapeHtml(area.ralColour)}</span>` : ""}</div>
          <div class="right">
            ${area.areaSqm != null ? `<span class="sqm">${area.areaSqm.toLocaleString()} m²</span>` : ""}
            <span class="area-total">S$0.00</span>
          </div>
        </div>
        ${area.prepNote ? `<div class="prep">${escapeHtml(area.prepNote)}</div>` : ""}
        <table>
          <thead>
            <tr>
              <th style="width:34px">S/No</th>
              <th>Description</th>
              <th style="width:74px">Colour</th>
              <th style="width:80px">Dosage</th>
              <th style="width:80px">Packing</th>
              <th style="width:110px">Unit Price</th>
              <th style="width:130px">Order Qty</th>
              <th style="width:120px">Line Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>WO ${escapeHtml(wo.woNumber)} — Amend</title>
<style>
  :root { --line:#999; --muted:#555; --bg:#fff; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; background: #f4f4f5; }
  .sheet { max-width: 960px; margin: 0 auto; background: var(--bg); padding: 22px 26px 60px; }
  .bar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center;
         justify-content: space-between; gap: 10px; background: #111; color: #fff;
         padding: 10px 26px; }
  .bar .msg { font-size: 12px; opacity: .85; }
  .bar button { font: inherit; font-weight: 600; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
  .bar .print { background: #fff; color: #111; }
  .bar .reset { background: transparent; color: #fff; border: 1px solid #666; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #111; padding-bottom: 10px; }
  .co { font-size: 18px; font-weight: 800; letter-spacing: .8px; }
  .co small { display: block; font-size: 9px; font-weight: 400; letter-spacing: 2.5px; color: var(--muted); }
  .title { font-size: 20px; font-weight: 700; text-align: right; }
  .title small { display: block; font-size: 11px; font-weight: 600; color: var(--muted); letter-spacing: 1px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 28px; margin: 14px 0 4px; }
  .meta div { display: flex; justify-content: space-between; border-bottom: 1px dotted #bbb; padding: 3px 0; }
  .meta span { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 9px; }
  .area { margin-top: 14px; page-break-inside: avoid; }
  .area-head { display: flex; justify-content: space-between; align-items: center;
               background: #f0f0f0; border: 1px solid var(--line); border-bottom: none; padding: 6px 8px; font-size: 13px; }
  .area-head .right { display: flex; align-items: center; gap: 12px; }
  .chip { font-size: 9px; font-weight: 600; color: var(--muted); border: 1px solid #bbb; border-radius: 8px; padding: 1px 6px; margin-left: 8px; }
  .sqm { font-size: 10px; color: var(--muted); font-weight: 600; }
  .area-total { font-size: 14px; font-weight: 800; }
  .prep { border: 1px solid var(--line); border-bottom: none; padding: 4px 8px; font-size: 10px; font-style: italic; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #fafafa; border: 1px solid var(--line); padding: 5px; font-size: 9px; text-transform: uppercase; }
  td { border: 1px solid var(--line); padding: 5px; vertical-align: middle; }
  td.desc { font-weight: 600; }
  .c { text-align: center; } .r { text-align: right; }
  tr.sub td { background: #fbfbfb; color: var(--muted); font-size: 11px; }
  input { font: inherit; text-align: right; width: 100%; max-width: 96px; padding: 6px 8px; border: 1px solid #bbb; border-radius: 5px; }
  input:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: #2563eb; }
  .qtywrap { display: flex; align-items: center; gap: 6px; justify-content: center; }
  .qtywrap input { max-width: 70px; }
  .uom { font-size: 10px; color: var(--muted); min-width: 26px; text-align: left; }
  .hint { display: block; margin-top: 3px; font-size: 10px; color: #2563eb; }
  .total { font-weight: 700; font-variant-numeric: tabular-nums; }
  .totals { margin: 16px 0 0 auto; width: 300px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted #bbb; }
  .totals .grand { border-bottom: none; border-top: 2px solid #111; margin-top: 4px; padding-top: 8px; font-size: 15px; font-weight: 800; }
  .foot { margin-top: 24px; font-size: 10px; color: #888; }
  @media print {
    body { background: #fff; }
    .bar { display: none; }
    .sheet { max-width: none; padding: 0; }
    input { border: none; padding: 0; -webkit-appearance: none; appearance: none; }
    input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { display: none; }
    .hint { color: var(--muted); }
    @page { size: A4 portrait; margin: 14mm; }
  }
</style></head>
<body>
  <div class="bar">
    <span class="msg">Working copy — edit Order Qty &amp; Unit Price, totals update live. This file is not linked to the system.</span>
    <div>
      <button class="reset" type="button" onclick="__reset()">Reset</button>
      <button class="print" type="button" onclick="window.print()">Print / Save PDF</button>
    </div>
  </div>
  <div class="sheet">
    <div class="head">
      <div class="co">CONPLUS RESOURCES PTE LTD<small>Protective Coatings · Flooring · Waterproofing</small></div>
      <div class="title">WORKS ORDER — AMENDMENT<small>WO ${escapeHtml(wo.woNumber)}</small></div>
    </div>
    <div class="meta">
      <div><span>Client</span><b>${escapeHtml(wo.clientName || "—")}</b></div>
      <div><span>Project Code / Job No</span><b>${escapeHtml(wo.jobNo || wo.projectCode || "—")}</b></div>
      <div><span>Project</span><b>${escapeHtml(wo.siteAddress || "—")}</b></div>
      <div><span>Quotation No</span><b>${escapeHtml(wo.quotationRef || "—")}</b></div>
      <div><span>Sales</span><b>${escapeHtml(wo.sales || "—")}</b></div>
      <div><span>Project I/C</span><b>${escapeHtml(wo.projectIc || "—")}</b></div>
      <div><span>Start Date</span><b>${escapeHtml(wo.startDate || "—")}</b></div>
      <div><span>Status</span><b style="text-transform:capitalize">${escapeHtml(wo.status.replace(/_/g, " "))}</b></div>
    </div>
    ${wo.remarks ? `<div class="prep" style="border:1px solid #999;margin-top:8px">${escapeHtml(wo.remarks)}</div>` : ""}
    ${areas}
    <div class="totals">
      <div><span>Value of work</span><b id="grand">S$0.00</b></div>
      <div><span>GST (9%)</span><b id="gst">S$0.00</b></div>
      <div class="grand"><span>Total incl. GST</span><b id="inclgst">S$0.00</b></div>
    </div>
    <div class="foot">Amended: <span id="stamp"></span>. Quantities and pricing are editable in this copy; save/print and return to Conplus to update the system of record.</div>
  </div>
  <script>
    (function () {
      var GST = 0.09;
      function num(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; }
      function fmt(n){ return "S$" + n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
      function recompute(){
        var grand = 0;
        document.querySelectorAll("[data-area]").forEach(function (area) {
          var sub = 0;
          area.querySelectorAll("tr[data-line]").forEach(function (row) {
            var q = num(row.querySelector(".qty").value);
            var p = num(row.querySelector(".price").value);
            var t = q * p; sub += t;
            row.querySelector(".total").textContent = fmt(t);
          });
          area.querySelector(".area-total").textContent = fmt(sub);
          grand += sub;
        });
        var gst = grand * GST;
        document.getElementById("grand").textContent = fmt(grand);
        document.getElementById("gst").textContent = fmt(gst);
        document.getElementById("inclgst").textContent = fmt(grand + gst);
      }
      window.__reset = function () {
        document.querySelectorAll("input.qty, input.price").forEach(function (i) { i.value = i.defaultValue; });
        recompute();
      };
      document.addEventListener("input", function (e) {
        if (e.target.classList && (e.target.classList.contains("qty") || e.target.classList.contains("price"))) recompute();
      });
      document.getElementById("stamp").textContent = new Date().toLocaleString("en-SG");
      recompute();
    })();
  </script>
</body></html>`;

  return html;
}

/** Trigger a browser download of the standalone editable amendment sheet. */
export function downloadWOAmendmentSheet(wo: WorksOrder): void {
  const html = buildWOAmendmentHtml(wo);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `WO_${wo.woNumber}_amendment.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
