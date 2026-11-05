import { describe, it, expect } from "vitest";
import {
  formatPeriod, workDoneLabel, periodLabel, rollUp, renumber,
  periodsForLine, seedPeriods, carryForward, subRowCount, blankPeriod, type WorkDonePeriod,
} from "@/lib/workDone";
import { applyWdrScan, buildWdrRequest, type WdrScanResult } from "@/lib/wdrScan";

const p = (over: Partial<WorkDonePeriod> = {}): WorkDonePeriod => ({
  seq: 1, label: "", periodFrom: null, periodTo: null, location: "",
  qty: 0, isCurrent: true, source: "manual", ...over,
});

describe("formatPeriod", () => {
  it("renders a same-month range the way the client writes it", () => {
    // Claim 01's sub-row, straight off the WDR (17/08/2026 – 23/08/2026).
    expect(formatPeriod("2026-08-17", "2026-08-23")).toBe("17-23 Aug'26");
    // Claim 02's second sub-row keeps its leading zero.
    expect(formatPeriod("2026-09-01", "2026-09-15")).toBe("01-15 Sep'26");
  });
  it("handles one day, crossing months and crossing years", () => {
    expect(formatPeriod("2026-08-17", "2026-08-17")).toBe("17 Aug'26");
    expect(formatPeriod("2026-08-28", "2026-09-05")).toBe("28 Aug-05 Sep'26");
    expect(formatPeriod("2025-12-28", "2026-01-05")).toBe("28 Dec'25-05 Jan'26");
  });
  it("tolerates a missing or unusable end", () => {
    expect(formatPeriod("2026-08-17", null)).toBe("17 Aug'26");
    expect(formatPeriod(null, "2026-08-23")).toBe("23 Aug'26");
    expect(formatPeriod(null, null)).toBe("");
    expect(formatPeriod("17/08/2026", null)).toBe("");
    expect(formatPeriod("2026-13-01", null)).toBe("");
  });
});

describe("workDoneLabel", () => {
  it("reproduces the client's sub-row description", () => {
    expect(workDoneLabel("2026-08-17", "2026-08-23", "1st Storey")).toBe("Work Done: 17-23 Aug'26 - 1st Storey");
    expect(workDoneLabel("2026-09-01", "2026-09-15", "1st Storey")).toBe("Work Done: 01-15 Sep'26 - 1st Storey");
  });
  it("drops the half that is missing", () => {
    expect(workDoneLabel("2026-08-17", "2026-08-23", "")).toBe("Work Done: 17-23 Aug'26");
    expect(workDoneLabel(null, null, "1st Storey")).toBe("Work Done: 1st Storey");
    expect(workDoneLabel(null, null, "  ")).toBe("");
  });
  it("lets a typed label win over the derived one", () => {
    expect(periodLabel(p({ label: "Work Done: ad-hoc touch up" , periodFrom: "2026-08-17" }))).toBe("Work Done: ad-hoc touch up");
    expect(periodLabel(p({ periodFrom: "2026-08-17", periodTo: "2026-08-23", location: "1st Storey" })))
      .toBe("Work Done: 17-23 Aug'26 - 1st Storey");
  });
});

describe("rollUp", () => {
  it("splits Previous and Current exactly as Claim 02 does", () => {
    // Claim Details rows 17-18: prev 107.64 + curr 250 → item row J=107.64, K=250.
    const periods = [
      p({ seq: 1, qty: 107.64, isCurrent: false }),
      p({ seq: 2, qty: 250, isCurrent: true }),
    ];
    expect(rollUp(periods)).toEqual({ prevQty: 107.64, currQty: 250, cumQty: 357.64 });
  });
  it("adds several periods on each side and keeps 2dp", () => {
    const periods = [
      p({ qty: 10.1, isCurrent: false }), p({ qty: 0.2, isCurrent: false }),
      p({ qty: 5.05, isCurrent: true }), p({ qty: 1.111, isCurrent: true }),
    ];
    expect(rollUp(periods)).toEqual({ prevQty: 10.3, currQty: 6.16, cumQty: 16.46 });
  });
  it("treats a non-finite quantity as zero rather than poisoning the total", () => {
    expect(rollUp([p({ qty: Number.NaN }), p({ qty: 4 })])).toEqual({ prevQty: 0, currQty: 4, cumQty: 4 });
  });
  it("is zero for no periods", () => {
    expect(rollUp([])).toEqual({ prevQty: 0, currQty: 0, cumQty: 0 });
  });
});

describe("periodsForLine", () => {
  it("uses the stored breakdown when there is one, in seq order", () => {
    const stored = [p({ seq: 2, qty: 250 }), p({ seq: 1, qty: 107.64, isCurrent: false })];
    const out = periodsForLine({ prevQty: 107.64, currQty: 250 }, stored);
    expect(out.map((x) => x.qty)).toEqual([107.64, 250]);
    expect(out.map((x) => x.seq)).toEqual([1, 2]);
  });
  it("invents nothing for a legacy line, so its printed output is unchanged", () => {
    // No stored breakdown → no periods. claimExcel then falls back to the
    // line's own prev/curr on a single sub-row, exactly as before item 2.
    expect(periodsForLine({ prevQty: 107.64, currQty: 250, remarks: "Work Done: 01-15 Sep'26" }, undefined)).toEqual([]);
    expect(periodsForLine({ prevQty: 0, currQty: 0 }, [])).toEqual([]);
  });
});

describe("seedPeriods", () => {
  it("returns the stored breakdown untouched when there is one", () => {
    const stored = [p({ seq: 1, qty: 107.64, isCurrent: false }), p({ seq: 2, qty: 250 })];
    expect(seedPeriods({ prevQty: 107.64, currQty: 250 }, stored)).toHaveLength(2);
  });
  it("seeds one current row from a legacy line, keeping its remarks", () => {
    const out = seedPeriods({ prevQty: 0, currQty: 107.64, remarks: "Work Done: 17-23 Aug'26 - 1st Storey" }, undefined);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ seq: 1, qty: 107.64, isCurrent: true, label: "Work Done: 17-23 Aug'26 - 1st Storey" });
  });
  it("seeds a carried row for a legacy previous quantity, left unlabelled to date", () => {
    const out = seedPeriods({ prevQty: 107.64, currQty: 250, remarks: "Work Done: 01-15 Sep'26" }, undefined);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ seq: 1, qty: 107.64, isCurrent: false, source: "carried", label: "" });
    expect(out[1]).toMatchObject({ seq: 2, qty: 250, isCurrent: true });
    // Seeding must not change the totals the claim already shows.
    expect(rollUp(out)).toEqual({ prevQty: 107.64, currQty: 250, cumQty: 357.64 });
  });
  it("gives an untouched line one empty slot to type into", () => {
    expect(seedPeriods({ prevQty: null, currQty: null }, undefined)).toHaveLength(1);
  });
});

describe("carryForward", () => {
  it("turns this claim's periods into the next claim's previous periods", () => {
    const claim1 = [p({ seq: 1, periodFrom: "2026-08-17", periodTo: "2026-08-23", location: "1st Storey", qty: 107.64, source: "wdr" })];
    const claim2 = carryForward(claim1);
    expect(claim2).toHaveLength(1);
    expect(claim2[0].isCurrent).toBe(false);
    expect(claim2[0].source).toBe("carried");
    // The label is frozen so a later rename of the location cannot rewrite history.
    expect(claim2[0].label).toBe("Work Done: 17-23 Aug'26 - 1st Storey");
    expect(rollUp(claim2)).toEqual({ prevQty: 107.64, currQty: 0, cumQty: 107.64 });
  });
  it("drops the empty placeholder slots", () => {
    expect(carryForward([p({ qty: 107.64, periodFrom: "2026-08-17", periodTo: "2026-08-23" }), p({ qty: 0 })])).toHaveLength(1);
  });
  it("carries forward twice without double counting", () => {
    const c1 = [p({ seq: 1, periodFrom: "2026-08-17", periodTo: "2026-08-23", qty: 107.64 })];
    const c2 = [...carryForward(c1), p({ seq: 2, periodFrom: "2026-09-01", periodTo: "2026-09-15", qty: 250 })];
    expect(rollUp(c2)).toEqual({ prevQty: 107.64, currQty: 250, cumQty: 357.64 });
    const c3 = [...carryForward(c2), p({ seq: 3, qty: 30, periodFrom: "2026-10-01", periodTo: "2026-10-09" })];
    expect(rollUp(c3)).toEqual({ prevQty: 357.64, currQty: 30, cumQty: 387.64 });
    expect(c3.map((x) => x.seq)).toEqual([1, 2, 3]);
  });
});

describe("renumber / subRowCount / blankPeriod", () => {
  it("closes the gap left by a removed row", () => {
    expect(renumber([p({ seq: 1 }), p({ seq: 3 }), p({ seq: 7 })]).map((x) => x.seq)).toEqual([1, 2, 3]);
  });
  it("reserves one Excel slot per period, never fewer than one", () => {
    expect(subRowCount([])).toBe(1);
    expect(subRowCount([p(), p()])).toBe(2);
  });
  it("adds a blank current row", () => {
    expect(blankPeriod(3)).toMatchObject({ seq: 3, qty: 0, isCurrent: true, source: "manual" });
    expect(blankPeriod(1, false).isCurrent).toBe(false);
  });
});

describe("applyWdrScan", () => {
  const lines = [
    { id: "l1", description: "To Floor\nSurface preparation", qty: 759, prevQty: 107.64 },
    { id: "l2", description: "To Wall", qty: 6, prevQty: 0 },
  ];

  it("prefills the current period from the scan", () => {
    const res: WdrScanResult = {
      ok: true, period_from: "2026-09-01", period_to: "2026-09-15", confidence: "high",
      lines: [{ line_id: "l1", qty: 250, location: "1st Storey" }],
    };
    const out = applyWdrScan(res, lines);
    expect(out.periodFrom).toBe("2026-09-01");
    expect(out.periodTo).toBe("2026-09-15");
    expect(out.current).toEqual({ l1: { qty: 250, location: "1st Storey" } });
    expect(out.matchedLines).toBe(1);
    // l2 got no figure — left out entirely rather than guessed at zero.
    expect(out.current.l2).toBeUndefined();
  });

  it("caps a quantity that would over-claim the priced item and says so", () => {
    const res: WdrScanResult = { ok: true, lines: [{ line_id: "l2", qty: 99 }] };
    const out = applyWdrScan(res, lines);
    expect(out.current.l2.qty).toBe(6);
    expect(out.notes.join(" ")).toContain("only 6 of the priced 6 is left");
  });

  it("accounts for what was already claimed when capping", () => {
    const res: WdrScanResult = { ok: true, lines: [{ line_id: "l1", qty: 1000 }] };
    const out = applyWdrScan(res, lines);
    expect(out.current.l1.qty).toBe(651.36); // 759 priced − 107.64 already claimed
  });

  it("clamps a negative reading to zero", () => {
    const out = applyWdrScan({ ok: true, lines: [{ line_id: "l2", qty: -5 }] }, lines);
    expect(out.current.l2.qty).toBe(0);
  });

  it("warns about handwriting whenever confidence is low or nothing matched", () => {
    expect(applyWdrScan({ ok: true, lines: [] }, lines).notes[0]).toContain("handwritten");
    expect(applyWdrScan({ ok: true, confidence: "low", lines: [{ line_id: "l1", qty: 1 }] }, lines).notes[0])
      .toContain("handwritten");
  });

  it("surfaces unmatched WDR items, notes and warnings", () => {
    const res: WdrScanResult = {
      ok: true, confidence: "high",
      lines: [{ line_id: "l1", qty: 10, note: "figure is a sum of four take-offs" }],
      unmatched: [{ description: "Touch-up at area B", qty: 3 }],
      warnings: ["Page 2 is a drawing, not a form."],
    };
    const notes = applyWdrScan(res, lines).notes.join(" | ");
    expect(notes).toContain("sum of four take-offs");
    expect(notes).toContain("Touch-up at area B × 3");
    expect(notes).toContain("Page 2 is a drawing");
  });

  it("ignores a line id that is not on this claim", () => {
    const out = applyWdrScan({ ok: true, lines: [{ line_id: "nope", qty: 5 }] }, lines);
    expect(out.current).toEqual({});
    expect(out.matchedLines).toBe(0);
  });

  it("returns the refusal reason and no prefill when the scan failed", () => {
    const out = applyWdrScan({ ok: false, reason: "Scan service returned 500" }, lines);
    expect(out.notes).toEqual(["Scan service returned 500"]);
    expect(out.current).toEqual({});
    expect(out.periodFrom).toBeNull();
  });
});

describe("buildWdrRequest", () => {
  it("sends the claim's own lines so the model maps onto them", () => {
    const req = buildWdrRequest(
      { projectCode: "E25077", claimNo: 2 },
      [{ id: "l1", pgRef: "A1", zone: "H92 ZONE 28 - WST", description: "To Floor", unit: "m2", qty: 759, prevQty: 107.64 }],
      [{ mime: "image/jpeg", base64: "aaa" }, { mime: "image/jpeg", base64: "bbb" }],
    );
    expect(req.project_code).toBe("E25077");
    expect(req.claim_no).toBe(2);
    expect(req.pages).toHaveLength(2);
    expect(req.lines[0]).toEqual({
      line_id: "l1", pg_ref: "A1", zone: "H92 ZONE 28 - WST",
      description: "To Floor", unit: "m2", qty: 759, claimed: 107.64,
    });
  });
});
