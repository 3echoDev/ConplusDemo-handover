// Printable Works Order, modelled on the client's "WO TEMPLATE" —
// header fields, then areas with their material lines. Print-to-PDF via browser.
import type { WorksOrder } from "@/data/sampleData";
import { exportRecordToExcel, type RecordSection } from "@/lib/exportData";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Their acknowledge list, per the WO template. */
const ACKNOWLEDGE = ["Jensen", "Halal", "Seng Tat", "Wendy", "Hnin", "Vincent", "Meredith"];

export function buildWOHtml(wo: WorksOrder, opts: { autoPrint: boolean }) {
  const totalSets = wo.areas.reduce(
    (s, a) => s + a.lines.reduce((t, l) => t + (l.requiredQty ?? 0), 0),
    0,
  );

  const areas = wo.areas
    .map((area) => {
      const rows = area.lines
        .map(
          (l, n) => `
        <tr>
          <td class="c">${n + 1}</td>
          <td>${escapeHtml(l.description)}</td>
          <td class="c">${escapeHtml(l.colour || "—")}</td>
          <td class="r">${l.dosage != null ? `${l.dosage} ${escapeHtml(l.dosageUnit)}` : "—"}</td>
          <td class="r">${l.packingSize != null ? `${l.packingSize} ${escapeHtml(l.packingUnit)}` : "—"}</td>
          <td class="r"><b>${l.isMixComponent ? "—" : `${l.requiredQty ?? "—"} ${escapeHtml(l.qtyUnit)}`}</b></td>
          <td>${escapeHtml(l.remarks || "")}</td>
        </tr>`,
        )
        .join("");

      return `
      <div class="area">
        <div class="area-head">
          <div>
            <b>${escapeHtml(area.areaName)}</b>
            ${area.ralColour ? `<span class="chip">${escapeHtml(area.ralColour)}</span>` : ""}
          </div>
          ${area.areaSqm != null ? `<div class="sqm">Area: ${area.areaSqm.toLocaleString()} m²</div>` : ""}
        </div>
        ${area.prepNote ? `<div class="prep">${escapeHtml(area.prepNote)}</div>` : ""}
        <table>
          <thead>
            <tr>
              <th style="width:34px">S/No</th>
              <th>Description</th>
              <th style="width:78px">Colour</th>
              <th style="width:82px">Dosage</th>
              <th style="width:82px">Packing</th>
              <th style="width:82px">Order Qty</th>
              <th style="width:150px">Remarks</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join("");

  const signatures = ACKNOWLEDGE.map((n) => `<div class="sig">${escapeHtml(n)}</div>`).join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>WO ${escapeHtml(wo.woNumber)} — Works Order</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #111; padding-bottom: 10px; }
  .co { font-size: 18px; font-weight: 800; letter-spacing: .8px; }
  .co small { display: block; font-size: 9px; font-weight: 400; letter-spacing: 2.5px; color: #555; }
  .title { font-size: 20px; font-weight: 700; text-align: right; }
  .title small { display: block; font-size: 11px; font-weight: 600; color: #555; letter-spacing: 1px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 28px; margin: 14px 0 4px; }
  .meta div { display: flex; justify-content: space-between; border-bottom: 1px dotted #bbb; padding: 3px 0; }
  .meta span { color: #555; font-weight: 600; text-transform: uppercase; font-size: 9px; }
  .area { margin-top: 14px; page-break-inside: avoid; }
  .area-head { display: flex; justify-content: space-between; align-items: baseline;
               background: #f0f0f0; border: 1px solid #999; border-bottom: none; padding: 6px 8px; font-size: 12px; }
  .chip { font-size: 9px; font-weight: 600; color: #555; border: 1px solid #bbb;
          border-radius: 8px; padding: 1px 6px; margin-left: 8px; }
  .sqm { font-size: 10px; color: #555; font-weight: 600; }
  .prep { border: 1px solid #999; border-bottom: none; padding: 4px 8px; font-size: 10px; font-style: italic; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #fafafa; border: 1px solid #999; padding: 5px; font-size: 9px; text-transform: uppercase; }
  td { border: 1px solid #999; padding: 5px; }
  .c { text-align: center; } .r { text-align: right; }
  .total { margin-top: 12px; margin-left: auto; width: 240px; display: flex;
           justify-content: space-between; border-top: 2px solid #111; padding-top: 6px;
           font-weight: 800; font-size: 13px; }
  .ack { margin-top: 34px; }
  .ack-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #555; margin-bottom: 26px; }
  .sigs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 26px 20px; }
  .sig { border-top: 1px solid #111; padding-top: 5px; font-size: 9px; color: #555; text-transform: uppercase; }
  .foot { margin-top: 18px; font-size: 9px; color: #888; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <div class="head">
    <div class="co">CONPLUS RESOURCES PTE LTD<small>Protective Coatings · Flooring · Waterproofing</small></div>
    <div class="title">WORKS ORDER<small>WO ${escapeHtml(wo.woNumber)}</small></div>
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

  <div class="total"><span>Total to order</span><span>${totalSets} sets</span></div>

  <div class="ack">
    <div class="ack-title">Acknowledged by</div>
    <div class="sigs">${signatures}</div>
  </div>

  <div class="foot">Quantities calculated from area × dosage ÷ pack size.</div>
</body></html>`;

  return html;
}

export function printWO(wo: WorksOrder): void {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.write(buildWOHtml(wo, { autoPrint: true }));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

/** The same works order as a spreadsheet, keeping the template's shape. */
export function exportWOToExcel(wo: WorksOrder): void {
  const sections: RecordSection[] = [
    {
      heading: `Works Order ${wo.woNumber}`,
      fields: [
        { label: "Client", value: wo.clientName },
        { label: "Project Code / Job No", value: wo.jobNo || wo.projectCode },
        { label: "Project", value: wo.siteAddress },
        { label: "Quotation No", value: wo.quotationRef },
        { label: "Sales", value: wo.sales },
        { label: "Project I/C", value: wo.projectIc },
        { label: "Start Date", value: wo.startDate ?? "" },
        { label: "Status", value: wo.status.replace(/_/g, " ") },
        { label: "Remarks", value: wo.remarks },
      ],
    },
    ...wo.areas.map((a): RecordSection => ({
      heading: `${a.areaName}${a.ralColour ? ` (${a.ralColour})` : ""}${a.areaSqm != null ? ` — ${a.areaSqm} m2` : ""}`,
      fields: a.prepNote ? [{ label: "Preparation", value: a.prepNote }] : undefined,
      table: {
        headers: ["S/No", "Description", "Colour", "Dosage", "Packing", "Order Qty", "Remarks"],
        rows: a.lines.map((l, i) => [
          i + 1,
          l.description,
          l.colour,
          l.dosage != null ? `${l.dosage} ${l.dosageUnit}` : "",
          l.packingSize != null ? `${l.packingSize} ${l.packingUnit}` : "",
          l.isMixComponent ? "mix component" : l.requiredQty ?? "",
          l.remarks,
        ]),
      },
    })),
    {
      heading: "Total",
      fields: [
        {
          label: "Total to order (sets)",
          value: wo.areas.reduce((s, a) => s + a.lines.reduce((t, l) => t + (l.requiredQty ?? 0), 0), 0),
        },
      ],
    },
  ];
  exportRecordToExcel(sections, `works_order_${wo.woNumber}`);
}
