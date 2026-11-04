import { describe, it, expect } from "vitest";
import { buildPOHtml, splitPacking } from "@/lib/poDocument";
import type { PurchaseOrder } from "@/data/sampleData";

// Client's revised PO template, 27 Oct 2026: Packing and UOM are two columns,
// the numeric pack size and the unit of that pack ("20.00" + "kg/set").
describe("splitPacking", () => {
  it("splits a packing string into pack size and unit", () => {
    expect(splitPacking({ unit: "30kg/set" })).toEqual({ packing: "30", uom: "kg/set" });
    expect(splitPacking({ unit: "25 kg/bag" })).toEqual({ packing: "25", uom: "kg/bag" });
    expect(splitPacking({ unit: "12.00kg/set" })).toEqual({ packing: "12.00", uom: "kg/set" });
  });

  it("treats a string with no leading number as all UOM", () => {
    expect(splitPacking({ unit: "kg" })).toEqual({ packing: "", uom: "kg" });
    expect(splitPacking({ unit: "set" })).toEqual({ packing: "", uom: "set" });
  });

  it("is empty for a line with no unit", () => {
    expect(splitPacking({ unit: undefined })).toEqual({ packing: "", uom: "" });
    expect(splitPacking({ unit: "  " })).toEqual({ packing: "", uom: "" });
  });

  it("lets an explicit packing / uom on the line win", () => {
    expect(splitPacking({ unit: "30kg/set", packing: "20", uom: "kg/pail" }))
      .toEqual({ packing: "20", uom: "kg/pail" });
    expect(splitPacking({ unit: "30kg/set", uom: "kg/pail" }))
      .toEqual({ packing: "", uom: "kg/pail" });
  });
});

const po: PurchaseOrder = {
  id: "po1", poNumber: "2610-0016", supplier: "Sto SEA Pte Ltd",
  supplierAddress: "159 Sin Ming Road", supplierContact: "Mr Eric Tan",
  supplierPhone: "", supplierEmail: "", project: "LTC Coatings - The Florida",
  projectId: "p1", projectCode: "E26005", worksOrder: "26001.1", shipTo: "",
  paymentTerms: "60 DAYS", requestedBy: "Meredith", remarks: "",
  amount: 0, gst: 0, status: "issued", createdDate: "2026-10-22", deliveryDate: "2026-11-02",
  items: [
    { itemCode: "EPA-20K", material: "StoPox EPA", unit: "20kg/set", qty: 45, unitPrice: 255 },
    { itemCode: "SCR-25K", material: "StoCrete SCR", unit: "25kg/bag", qty: 2128, unitPrice: 15.5 },
    { itemCode: "LEGACY", material: "Older row with a bare unit", unit: "kg", qty: 1, unitPrice: 10 },
  ],
};

describe("PO document item table", () => {
  const html = buildPOHtml(po, { autoPrint: false });

  it("has Packing and UOM as separate header columns, and no combined Unit column", () => {
    expect(html).toContain(">Packing</th>");
    expect(html).toContain(">UOM</th>");
    expect(html).not.toContain(">Unit</th>");
    // Unit Price must survive the rename.
    expect(html).toContain(">Unit Price</th>");
  });

  it("writes the pack size and the unit in their own cells", () => {
    expect(html).toContain('<td class="c">20</td>\n        <td class="c">kg/set</td>');
    expect(html).toContain('<td class="c">25</td>\n        <td class="c">kg/bag</td>');
    // A pre-split row keeps its unit under UOM and leaves Packing blank.
    expect(html).toContain('<td class="c"></td>\n        <td class="c">kg</td>');
  });

  it("keeps every row at nine cells, data and padding alike", () => {
    const rows = html.split("<tbody>")[1].split("</tbody>")[0].split("<tr>").slice(1);
    expect(rows.length).toBeGreaterThanOrEqual(10); // MIN_ROWS padding
    for (const row of rows) expect((row.match(/<td/g) ?? []).length).toBe(9);
  });
});
