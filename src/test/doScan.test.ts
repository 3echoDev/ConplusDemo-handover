import { describe, expect, it } from "vitest";
import { applyScanResult, buildScanRequest } from "@/lib/doScan";

const LINES = [
  { id: "l1", description: "StoPox WL 100 (RAL 7037)", qty: 10, unit: "set", qty_balance: 6 },
  { id: "l2", description: "StoPox GH 532 Clear", qty: 4, unit: "set", qty_balance: 4 },
  { id: "l3", description: "Thinner", qty: 2, unit: "L", qty_balance: 0 },
];

describe("buildScanRequest", () => {
  it("sends every PO line with its outstanding balance and the image", () => {
    const req = buildScanRequest({ po_number: "2609-0003", supplier_name: "Sto" }, LINES, { mime: "image/jpeg", base64: "abc" });
    expect(req.po_number).toBe("2609-0003");
    expect(req.lines).toEqual([
      { line_id: "l1", description: "StoPox WL 100 (RAL 7037)", qty: 10, unit: "set", outstanding: 6 },
      { line_id: "l2", description: "StoPox GH 532 Clear", qty: 4, unit: "set", outstanding: 4 },
      { line_id: "l3", description: "Thinner", qty: 2, unit: "L", outstanding: 0 },
    ]);
    expect(req.image.base64).toBe("abc");
  });
});

describe("applyScanResult", () => {
  it("prefills matched lines, blanks unmentioned ones, and keeps the DO header", () => {
    const out = applyScanResult(
      { ok: true, do_number: "80067779", delivery_date: "2026-09-12T00:00:00", lines: [{ line_id: "l1", qty_received: 5 }], confidence: "high" },
      LINES,
      { l2: "4" },
    );
    expect(out.doNumber).toBe("80067779");
    expect(out.deliveryDate).toBe("2026-09-12");
    expect(out.receiving).toEqual({ l1: "5", l2: "", l3: "" });
    expect(out.matchedLines).toBe(1);
    expect(out.notes).toEqual([]);
  });

  it("clamps to the outstanding balance and explains why", () => {
    const out = applyScanResult({ ok: true, lines: [{ line_id: "l1", qty_received: 9 }, { line_id: "l3", qty_received: 2 }] }, LINES);
    expect(out.receiving.l1).toBe("6");
    expect(out.receiving.l3).toBe("");
    expect(out.notes.some((n) => n.includes("only 6 outstanding"))).toBe(true);
    expect(out.notes.some((n) => n.includes("only 0 outstanding"))).toBe(true);
  });

  it("ignores unknown line ids and nulls, surfaces unmatched DO lines and warnings", () => {
    const out = applyScanResult(
      {
        ok: true,
        lines: [{ line_id: "nope", qty_received: 3 }, { line_id: "l2", qty_received: null, note: "handwritten" }],
        unmatched: [{ description: "Pallet deposit", qty: 1 }],
        warnings: ["Date partly illegible"],
        confidence: "low",
      },
      LINES,
    );
    expect(out.receiving).toEqual({ l1: "", l2: "", l3: "" });
    expect(out.matchedLines).toBe(0);
    expect(out.notes[0]).toMatch(/low-confidence/i);
    expect(out.notes).toContain("On the DO but not on this PO: Pallet deposit × 1.");
    expect(out.notes).toContain("Date partly illegible");
  });

  it("returns the refusal reason when the service says no", () => {
    const out = applyScanResult({ ok: false, reason: "bad token" }, LINES, { l1: "2" });
    expect(out.doNumber).toBeNull();
    expect(out.receiving).toEqual({ l1: "2" });
    expect(out.notes).toEqual(["bad token"]);
  });
});
