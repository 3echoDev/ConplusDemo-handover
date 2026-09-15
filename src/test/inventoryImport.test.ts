import { describe, expect, it } from "vitest";
import {
  canonDate,
  cellText,
  cleanMaterialName,
  findHeaderRow,
  parseInventorySheet,
  parseMaterialMaster,
  planInventoryImport,
  shelfLifeText,
  toRpcRows,
  type ExistingMovement,
  type MaterialRef,
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

const formulaSno = (n: number): RawCell => ({ formula: "ROW()-ROW(OPStock[[#Headers],[S/No.]])", result: n });

const MATERIALS: MaterialRef[] = [
  { id: "m-cryl", name: "Cryl Finish 200", code: "Cryl Finish 200", qtyOnHand: 3, isActive: true },
  { id: "m-top", name: "Master Top 1705 RAL- 7035", code: "MT1705", qtyOnHand: 4, isActive: true },
  { id: "m-sika", name: "Sika Floor 161 Primer", code: null, qtyOnHand: 2, isActive: true }, // 2 = sheet 2 + store form 0
  { id: "m-k54", name: "Accelerator K54", code: null, qtyOnHand: 5, isActive: true }, // sheet 1 + store form 4
];

const EXISTING: ExistingMovement[] = [
  { id: "a", sno: 1, material_id: "m-cryl", qty_in: "3", qty_out: "0" },
  { id: "b", sno: 2, material_id: "m-top", qty_in: "4", qty_out: 0 },
  { id: "c", sno: 3, material_id: "m-sika", qty_in: "4", qty_out: "2" },
  { id: "d", sno: 4, material_id: "m-k54", qty_in: 1, qty_out: 0 },
];

describe("cell helpers", () => {
  it("collapses '-', NA and blanks to null and unwraps formula / rich text", () => {
    expect(cellText("-")).toBeNull();
    expect(cellText("NA")).toBeNull();
    expect(cellText("n/a")).toBeNull();
    expect(cellText("   ")).toBeNull();
    expect(cellText({ result: "Gammon" })).toBe("Gammon");
    expect(cellText({ richText: [{ text: "RES - " }, { text: "Coway" }] })).toBe("RES - Coway");
    expect(cellText(new Date("not a date"))).toBeNull();
  });

  it("canonicalises the three date shapes the ledger holds", () => {
    expect(canonDate("27.07.26")).toBe("2026-07-27");
    expect(canonDate("2026-08-30 00:00:00")).toBe("2026-08-30");
    expect(canonDate(new Date(Date.UTC(2027, 6, 1)))).toBe("2027-07-01");
    expect(canonDate("04/2025")).toBe("04/2025"); // expiry month text stays verbatim
    expect(canonDate("NA")).toBeNull();
  });

  it("keeps shelf life only when it reads like a duration", () => {
    expect(shelfLifeText("12 months")).toBe("12 months");
    expect(shelfLifeText({ formula: "INDEX(...)", result: new Date("garbage") })).toBeNull();
    expect(shelfLifeText("Solvent Free")).toBeNull();
  });

  it("cuts article notes and kit breakdowns off a material name", () => {
    expect(cleanMaterialName("Triflex Cryl Primer 287 Unpigmented\nArticle No.: 22877-000-140")).toBe("Triflex Cryl Primer 287 Unpigmented");
    expect(cleanMaterialName("StoPox | EPS-GP 80Kg Set\nConsists of:\n- 03 x 53000-427")).toBe("StoPox | EPS-GP 80Kg Set");
    expect(cleanMaterialName("StoPox WL 100 (RAL 7037 - PG11)")).toBe("StoPox WL 100 (RAL 7037 - PG11)");
  });
});

describe("parseInventorySheet", () => {
  it("finds the header row and reads numbered rows in sheet column order", () => {
    const cells = sheet([
      [formulaSno(1), "Triflex", null, "Cryl Finish 200", null, { formula: "x", result: null }, 10, "Kg", "Solvent Free (Coating)", 3, null, null, "Sample", null, null, null, null],
      [formulaSno(2), "Sika", "Outside Store", "Sika Floor 161 Primer", new Date(Date.UTC(2025, 0, 1)), "24 months", 20, "Kg", "Solvent Free (Primer)", 4, "16.07.26", "Gammon", "RES - TYJ", 2, "03.08.26", "Gammon", "-"],
      [formulaSno(3), null, null, null, null, null, null, null, null, null, null, null, "-", null, null, null, null],
      ["not a row"],
    ]);
    expect(findHeaderRow(cells)).toBe(14);
    const { rows } = parseInventorySheet(cells);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ sno: 1, material: "Cryl Finish 200", packing: 10, qtyIn: 3, qtyOut: null, remarksIn: "Sample" });
    expect(rows[1]).toMatchObject({ sno: 2, expiryDate: "2025-01-01", dateIn: "2026-07-16", qtyOut: 2, dateOut: "2026-08-03", projectOut: "Gammon", remarksOut: null });
  });

  it("throws a readable error when the header is missing", () => {
    expect(() => parseInventorySheet([["foo"], ["bar"]])).toThrow(/header row/i);
  });
});

describe("parseMaterialMaster", () => {
  it("reads unit and shelf life per material from the Material sheet", () => {
    const master = parseMaterialMaster([
      [],
      [null, "Coating Materials – Shelf Life", null, "LAST UPDATED:", "Wed Sep 09 2026"],
      [null, "Supplier", "Material", "UNIT", "Shelf Life (PART A)", "Shelf Life (PART B)", "Shelf Life (PART C)", "Shelf Life (PART D)"],
      [null, "Triflex", "Primer 209 (RAL 7009)", "10kg/set", "6 months", "6 months", "-", "-"],
      [null, "Flowcrete ", "Flowcrete MF/RT/HF-Yellow", "19.75kg/set", "12 months", "12 months", "6 months", "12 months"],
      [null, "Triflex", "Primer 209 (RAL 7009)", "dupe", "1 month", "-", "-", "-"], // first wins
    ]);
    expect(master.size).toBe(2);
    expect(master.get("primer 209 (ral 7009)")).toMatchObject({ unit: "10kg/set", shelfLifeA: "6 months", shelfLifeC: null });
    expect(master.get("flowcrete mf/rt/hf-yellow")).toMatchObject({ supplier: "Flowcrete", shelfLifeD: "12 months" });
  });

  it("returns an empty map when the sheet is not a master", () => {
    expect(parseMaterialMaster([["Row Labels", "Sum of Quantity_IN"]]).size).toBe(0);
  });
});

describe("planInventoryImport (snapshot)", () => {
  const rows = parseInventorySheet(
    sheet([
      // same as before → unchanged
      [formulaSno(1), "Triflex", "-", "Cryl Finish 200", null, null, 10, "Kg", null, 3, null, null, "Sample", null, null, null, null],
      // renumbered + renamed with spacing; qty_out grows → balance 4 → 2
      [formulaSno(2), "BASF", "R6 L3", "MasterTop 1705 RAL- 7035 ", null, null, 10, "Kg", null, 4, null, "Gammon", "-", 2, "05.09.26", "E25073", null],
      // Sika dropped from the sheet entirely (m-sika becomes an orphan)
      // K54 dropped too, but it has Store-form rows → not an orphan
      // colour variant of an existing name is a NEW material, not a merge
      [formulaSno(3), "Triflex", null, "Cryl Finish 200 (RAL 7004)", null, null, 10, "Kg", null, 2, null, null, "Sample", null, null, null, null],
      // brand new, two batches of the same name → one material, rows summed
      [formulaSno(4), "Sto", "R1 L1", "StoPur TC UV Matt (RAL 7032 - PG11)", null, null, 5, "Kg", null, 3, "01.09.26", "E25077", null, 1, "09.09.26", "E25077", null],
      [formulaSno(5), "Sto", "R1 L2", "StoPur TC UV Matt (RAL 7032 - PG11)", null, null, 5, "Kg", null, 4, null, null, null, null, null, null, null],
      // blank tail
      [formulaSno(6), null, null, null, null, null, null, null, null, null, null, null, "-", null, null, null, null],
    ]),
  ).rows;

  const plan = planInventoryImport(rows, EXISTING, MATERIALS, ["m-k54"]);

  it("keeps only stock rows and counts the blank tail", () => {
    expect(plan.rows.map((r) => r.sno)).toEqual([1, 2, 3, 4, 5]);
    expect(plan.blank).toBe(1);
  });

  it("matches names exactly, never merging a colour variant into the plain item", () => {
    expect(plan.matched).toBe(2); // m-cryl, m-top
    expect(plan.toCreate).toEqual(["Cryl Finish 200 (RAL 7004)", "StoPur TC UV Matt (RAL 7032 - PG11)"]);
  });

  it("computes balance before → after per material from the snapshot", () => {
    const by = Object.fromEntries(plan.balanceChanges.map((b) => [b.name, b]));
    expect(by["Master Top 1705 RAL- 7035"]).toMatchObject({ materialId: "m-top", before: 4, after: 2, rows: 1 });
    expect(by["Sika Floor 161 Primer"]).toMatchObject({ materialId: "m-sika", before: 2, after: 0, rows: 0 });
    // K54: 5 on hand = 1 from sheet + 4 store form; sheet row goes → 4 stays
    expect(by["Accelerator K54"]).toMatchObject({ before: 5, after: 4 });
    expect(by["StoPur TC UV Matt (RAL 7032 - PG11)"]).toMatchObject({ materialId: null, before: 0, after: 6, rows: 2 });
    expect(by["Cryl Finish 200 (RAL 7004)"]).toMatchObject({ materialId: null, after: 2 });
    expect(plan.unchanged).toBe(1); // Cryl Finish 200 stays at 3
    expect(plan.balanceChanges[0].name).toBe("StoPur TC UV Matt (RAL 7032 - PG11)"); // largest |delta| first
  });

  it("lists orphans: had sheet rows, none now, no Store-form rows", () => {
    expect(plan.orphans.map((o) => o.id)).toEqual(["m-sika"]);
  });

  it("builds RPC rows with ids for matches, names for new ones, master data when known", () => {
    const master = parseMaterialMaster([
      [null, "Supplier", "Material", "UNIT", "Shelf Life (PART A)", "Shelf Life (PART B)", "Shelf Life (PART C)", "Shelf Life (PART D)"],
      [null, "Sto", "StoPur TC UV Matt (RAL 7032 - PG11)", "5kg/set", "12 months", "-", "-", "-"],
    ]);
    const rpc = toRpcRows(plan, MATERIALS, master);
    expect(rpc).toHaveLength(5);
    expect(rpc.find((r) => r.sno === 2)).toMatchObject({ material_id: "m-top", qty_out: 2, date_out: "2026-09-05", project_out: "E25073" });
    expect(rpc.find((r) => r.sno === 3)).toMatchObject({ material_id: null, material_name: "Cryl Finish 200 (RAL 7004)", stock_unit: null });
    expect(rpc.find((r) => r.sno === 4)).toMatchObject({ material_id: null, stock_unit: "5kg/set", shelf_life_a: "12 months", shelf_life: "12 months", shelf_life_b: null });
  });
});
