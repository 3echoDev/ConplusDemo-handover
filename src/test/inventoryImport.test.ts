import { describe, expect, it } from "vitest";
import {
  canonDate,
  cellText,
  diffRow,
  findHeaderRow,
  parseInventorySheet,
  planInventoryImport,
  rpcRowsForPlan,
  shelfLifeText,
  type ExistingMovement,
  type RawCell,
} from "@/lib/inventoryImport";

const HEADER: RawCell[] = [
  "S/No.", "Supplier", "Location", "Material", "Expiry Date", "Shelf Life", "Packing", "UOM", "Coating Types",
  "Quantity_IN", "DATE QTY_IN", "Project_IN", "Remarks", "Quantity_OUT", "DATE QTY_OUT", "Project_OUT", "Remarks_OUT",
];

// Mirrors the client's Sheet2: title rows, a "LAST UPDATED" cell, then the table at row 15.
function sheet(dataRows: RawCell[][]): RawCell[][] {
  const pad: RawCell[][] = [];
  pad.push([]);
  pad.push([null, "LAST UPDATED DATE:", null, "Sat Aug 22 2026 17:02:42 GMT+0800"]);
  for (let i = 0; i < 12; i++) pad.push([]);
  return [...pad, HEADER, ...dataRows];
}

const formulaSno = (n: number): RawCell => ({ result: n });

const MATERIALS = [
  { id: "m-cryl", name: "Cryl Finish 200", code: "Cryl Finish 200" },
  { id: "m-top", name: "Master Top 1705 RAL- 7035", code: "MT1705" },
  { id: "m-sika", name: "Sika Floor 161 Primer", code: null },
];

const existingRow = (over: Partial<ExistingMovement>): ExistingMovement => ({
  id: "x",
  sno: 1,
  material_id: "m-cryl",
  supplier_name: "Triflex",
  location: null,
  packing: "10",
  uom: "Kgs",
  expiry_date: null,
  coating_type: "Solvent Free (Coating)",
  shelf_life: "6 months",
  qty_in: "3",
  date_in: null,
  project_in: null,
  remarks_in: "Sample",
  qty_out: 0,
  date_out: null,
  project_out: null,
  remarks_out: null,
  ...over,
});

describe("cell helpers", () => {
  it("collapses '-' and blanks to null and unwraps formula results", () => {
    expect(cellText("-")).toBeNull();
    expect(cellText("   ")).toBeNull();
    expect(cellText({ result: "Gammon" })).toBe("Gammon");
    expect(cellText({ richText: [{ text: "RES - " }, { text: "Coway" }] })).toBe("RES - Coway");
  });

  it("reads the sheet's NA / N/A as blank and ignores invalid Dates", () => {
    expect(cellText("NA")).toBeNull();
    expect(cellText("n/a")).toBeNull();
    expect(canonDate("NA")).toBeNull();
    expect(cellText(new Date("not a date"))).toBeNull();
  });

  it("keeps shelf life only when it reads like a duration", () => {
    expect(shelfLifeText("12 months")).toBe("12 months");
    expect(shelfLifeText({ formula: "INDEX(...)", result: new Date("garbage") })).toBeNull();
    expect(shelfLifeText("Solvent Free")).toBeNull();
  });

  it("canonicalises the three date shapes the ledger holds", () => {
    expect(canonDate("27.07.26")).toBe("2026-07-27");
    expect(canonDate("2026-08-30 00:00:00")).toBe("2026-08-30");
    expect(canonDate(new Date(Date.UTC(2027, 6, 1)))).toBe("2027-07-01");
    expect(canonDate("04/2025")).toBe("04/2025"); // expiry month text stays verbatim
    expect(canonDate("-")).toBeNull();
  });
});

describe("parseInventorySheet", () => {
  it("finds the header row and reads numbered rows in sheet column order", () => {
    const cells = sheet([
      [formulaSno(1), "Triflex", null, "Cryl Finish 200", null, { formula: "x", result: null }, 10, "Kgs", "Solvent Free (Coating)", 3, null, null, "Sample", null, null, null, null],
      [formulaSno(2), "Sika", "Outside Store", "Sika Floor 161 Primer", new Date(Date.UTC(2025, 0, 1)), "24 months", 20, "Kgs", "Solvent Free (Primer)", 4, "16.07.26", "Gammon", "RES - TYJ", 2, "03.08.26", "Gammon", "-"],
      [formulaSno(3), null, null, null, null, null, null, null, null, null, null, null, "-", null, null, null, null],
      ["not a row"],
    ]);
    expect(findHeaderRow(cells)).toBe(14);
    const { rows } = parseInventorySheet(cells);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ sno: 1, material: "Cryl Finish 200", packing: 10, qtyIn: 3, qtyOut: null, remarksIn: "Sample" });
    expect(rows[1]).toMatchObject({
      sno: 2,
      expiryDate: "2025-01-01",
      dateIn: "2026-07-16",
      qtyOut: 2,
      dateOut: "2026-08-03",
      projectOut: "Gammon",
      remarksOut: null,
    });
  });

  it("throws a readable error when the header is missing", () => {
    expect(() => parseInventorySheet([["foo"], ["bar"]])).toThrow(/header row/i);
  });
});

describe("planInventoryImport", () => {
  const rows = parseInventorySheet(
    sheet([
      // unchanged vs existingRow()
      [formulaSno(1), "Triflex", "-", "Cryl Finish 200", null, "6 months", 10, "Kgs", "Solvent Free (Coating)", 3, null, null, "Sample", null, null, null, null],
      // changed: qty_out 0 → 2, project_out set (name spacing differs from DB but resolves)
      [formulaSno(2), "BASF", "R6 L3", "MasterTop 1705 RAL- 7035 ", null, null, 10, "Kgs", null, 4, null, "Gammon", "-", 2, "05.09.26", "E25073", null],
      // new row
      [formulaSno(3), "Sika", "Outside Store", "Sika Floor 161 Primer", null, null, 20, "Kgs", null, 4, "16.07.26", "Gammon", null, null, null, null, null],
      // unknown material
      [formulaSno(4), "Sto", null, "Brand New Product X", null, null, 5, "Kgs", null, 1, null, null, null, null, null, null, null],
      // blank tail
      [formulaSno(5), null, null, null, null, null, null, null, null, null, null, null, "-", null, null, null, null],
    ]),
  ).rows;

  const existing: ExistingMovement[] = [
    existingRow({ id: "a", sno: 1 }),
    existingRow({
      id: "b",
      sno: 2,
      material_id: "m-top",
      supplier_name: "BASF",
      location: "R6 L3",
      coating_type: null,
      shelf_life: null,
      qty_in: "4",
      project_in: "Gammon",
      remarks_in: null,
      qty_out: "0",
    }),
  ];

  const plan = planInventoryImport(rows, existing, MATERIALS);

  it("buckets rows into unchanged / changed / new / unmatched / blank", () => {
    expect(plan.unchanged.map((p) => p.row.sno)).toEqual([1]);
    expect(plan.updates.map((p) => p.row.sno)).toEqual([2]);
    expect(plan.inserts.map((p) => p.row.sno)).toEqual([3]);
    expect(plan.unmatched.map((p) => p.row.sno)).toEqual([4]);
    expect(plan.blank).toBe(1);
  });

  it("reports field-level changes with the DB value before and the sheet value after", () => {
    const changes = plan.updates[0].changes!;
    expect(changes.map((c) => c.field).sort()).toEqual(["dateOut", "projectOut", "qtyOut"]);
    expect(changes.find((c) => c.field === "qtyOut")).toMatchObject({ before: 0, after: 2 });
    expect(changes.find((c) => c.field === "dateOut")).toMatchObject({ before: null, after: "2026-09-05" });
  });

  it("treats DB 0 and sheet blank as the same quantity, and numeric strings as numbers", () => {
    const row = rows[0];
    expect(diffRow(row, existingRow({ qty_out: "0", packing: "10.0" }), "m-cryl")).toEqual([]);
  });

  it("only sends unmatched rows to the RPC when creating missing materials", () => {
    expect(rpcRowsForPlan(plan, false).map((r) => r.sno)).toEqual([3, 2]);
    const withCreate = rpcRowsForPlan(plan, true);
    expect(withCreate.map((r) => r.sno)).toEqual([3, 2, 4]);
    const created = withCreate.find((r) => r.sno === 4)!;
    expect(created.material_id).toBeNull();
    expect(created.material_name).toBe("Brand New Product X");
    expect(withCreate.find((r) => r.sno === 2)!.material_id).toBe("m-top");
  });
});
