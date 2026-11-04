import { describe, it, expect } from "vitest";
import { claimFilterDate } from "@/lib/claimFilters";

/** Dates are ISO (YYYY-MM-DD), so a string compare is a date compare. */
const inRange = (d: string | null | undefined, from: string, to: string) => {
  if (!d) return !from && !to;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

describe("claimFilterDate", () => {
  it("uses the claim date when present", () => {
    expect(claimFilterDate({ claimDate: "2026-09-04", submittedDate: "—" })).toBe("2026-09-04");
  });

  it("falls back to a real submitted date when there is no claim date", () => {
    expect(claimFilterDate({ claimDate: "", submittedDate: "2026-09-08" })).toBe("2026-09-08");
  });

  it("never returns the display placeholder mapClaim writes for a null submitted_date", () => {
    expect(claimFilterDate({ claimDate: null, submittedDate: "—" })).toBe("");
  });

  it("keeps a dated claim visible when the range covers it", () => {
    const c = { claimDate: "2026-09-04", submittedDate: "—" };
    expect(inRange(claimFilterDate(c), "2026-09-01", "2026-09-30")).toBe(true);
  });

  it("regression: a claim with a null submitted_date is no longer filtered out", () => {
    // The placeholder sorts above any ISO date, so `d > to` was always true and
    // every claim fell out of the range — the homepage showed none of 158.
    const c = { claimDate: "2026-09-04", submittedDate: "—" };
    expect(inRange(c.submittedDate, "2026-09-01", "2026-09-30")).toBe(false);
    expect(inRange(claimFilterDate(c), "2026-09-01", "2026-09-30")).toBe(true);
  });
});
