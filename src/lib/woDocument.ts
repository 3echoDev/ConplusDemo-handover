// Printable Works Order, modelled on the client's "WO TEMPLATE" —
// header fields, then areas with their material lines. Print-to-PDF via browser.
import type { WorksOrder } from "@/data/sampleData";
import { exportRecordToExcel, type RecordSection } from "@/lib/exportData";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/**
 * Unit label for the Order Qty column. The WO is ordered in whole packs, so the
 * label is "set(s)" — or "bag(s)" for bag-packed additives (e.g. G80 AO, 25 kg/bag).
 * Singular when the qty is exactly 1. The stored qty_unit is deliberately ignored:
 * the data carries "kg" there, but the printed order is counted in packs, not kg.
 */
export function qtyUnitLabel(l: { packingUnit: string; qtyUnit: string }, qty: number | null): string {
  const base = /bag/i.test(l.packingUnit) || /bag/i.test(l.qtyUnit) ? "bag" : "set";
  return qty === 1 ? base : `${base}s`;
}

/**
 * Strip the "Level N - " prefix the data stores on each line's remark. The level
 * is already the area/section header, so repeating it on every row is noise.
 */
export function cleanRemark(s: string): string {
  return s.replace(/^\s*level\s*\d+\s*[-–—]\s*/i, "");
}

/**
 * Base acknowledge names per the WO template. The WO's own Sales and Project I/C
 * are appended if not already present, so the signatory list reflects the people
 * on that order (e.g. Derrick on WO 25068) rather than a fixed roster.
 * NOTE: confirm the canonical base list with Conplus.
 */
const BASE_ACKNOWLEDGE = ["Jensen", "Halal", "Seng Tat", "Wendy", "Hnin", "Vincent"];

function acknowledgeList(wo: WorksOrder): string[] {
  const names = [...BASE_ACKNOWLEDGE];
  for (const n of [wo.sales, wo.projectIc]) {
    if (n && !names.includes(n)) names.push(n);
  }
  return names;
}

/**
 * Total sets/units to actually order: skip mix components and nested child lines
 * (they roll up under a parent), and use order_qty when it differs from required.
 */
export function woOrderTotal(wo: WorksOrder): number {
  return wo.areas.reduce(
    (s, a) =>
      s +
      a.lines.reduce((t, l) => {
        if (l.isMixComponent || l.parentLineId) return t;
        const q = l.orderQty != null ? l.orderQty : l.requiredQty ?? 0;
        return t + q;
      }, 0),
    0,
  );
}

export function buildWOHtml(wo: WorksOrder, opts: { autoPrint: boolean }) {
  const totalSets = woOrderTotal(wo);

  const areas = wo.areas
    .map((area) => {
      // Order qty cell: if order_qty is set and differs from required, show both,
      // e.g. the KU 601 "order 15, use rest ex-stock" case on WO 25068.
      const qtyCell = (l: (typeof area.lines)[number]) => {
        if (l.isMixComponent) return "—";
        const qty = l.orderQty != null ? l.orderQty : l.requiredQty;
        if (qty == null) return "—";
        return `${qty} ${qtyUnitLabel(l, qty)}`;
      };

      // Top-level order lines carry an S/No; mix components / variants nest
      // beneath their parent as indented sub-rows without a number.
      const parents = area.lines.filter((l) => !l.parentLineId);
      const childrenOf = (id: string) => area.lines.filter((l) => l.parentLineId === id);

      const renderLine = (l: (typeof area.lines)[number], sn: number | null, child: boolean) => `
        <tr${child ? ' class="sub"' : ""}>
          <td class="c">${sn ?? ""}</td>
          <td>${child ? "↳ " : ""}${escapeHtml(l.description)}</td>
          <td class="c">${escapeHtml(l.colour || "—")}</td>
          <td class="r">${l.dosage != null ? `${l.dosage} ${escapeHtml(l.dosageUnit)}` : "—"}</td>
          <td class="r">${l.packingSize != null ? `${l.packingSize} ${escapeHtml(l.packingUnit)}` : "—"}</td>
          <td class="r"><b>${qtyCell(l)}</b></td>
          <td>${escapeHtml(cleanRemark(l.remarks || ""))}</td>
        </tr>`;

      const rows = parents
        .map((p, n) => [renderLine(p, n + 1, false), ...childrenOf(p.id).map((c) => renderLine(c, null, true))].join(""))
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
              <th style="width:82px">Order Qty (Set)</th>
              <th style="width:150px">Remarks</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join("");

  const signatures = acknowledgeList(wo).map((n) => `<div class="sig">${escapeHtml(n)}</div>`).join("");

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
  tr.sub td { background: #fbfbfb; color: #555; font-size: 10px; }
  small.req { color: #888; font-weight: 400; }
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
    <div><span>Issue Date</span><b>${escapeHtml(wo.issueDate || "—")}</b></div>
    <div><span>Contact Person</span><b>${escapeHtml(wo.contactPerson || "—")}${wo.contactNumber ? ` (${escapeHtml(wo.contactNumber)})` : ""}</b></div>
    <div><span>Site Contact</span><b>${escapeHtml(wo.siteContact || "—")}${wo.siteContactNumber ? ` (${escapeHtml(wo.siteContactNumber)})` : ""}</b></div>
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
        headers: ["S/No", "Description", "Colour", "Dosage", "Packing", "Order Qty (Set)", "Remarks"],
        rows: a.lines.map((l, i) => {
          const qty = l.orderQty != null ? l.orderQty : l.requiredQty;
          return [
            i + 1,
            l.description,
            l.colour,
            l.dosage != null ? `${l.dosage} ${l.dosageUnit}` : "",
            l.packingSize != null ? `${l.packingSize} ${l.packingUnit}` : "",
            l.isMixComponent ? "mix component" : qty != null ? `${qty} ${qtyUnitLabel(l, qty)}` : "",
            cleanRemark(l.remarks || ""),
          ];
        }),
      },
    })),
    {
      heading: "Total",
      fields: [
        {
          label: "Total to order (sets)",
          value: woOrderTotal(wo),
        },
      ],
    },
  ];
  exportRecordToExcel(sections, `works_order_${wo.woNumber}`);
}
