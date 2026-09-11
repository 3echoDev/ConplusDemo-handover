import { describe, it, expect } from "vitest";
import { computeClaimTotals, type ClaimDocContext } from "@/lib/claimDocument";
import type { Claim, ClaimLine } from "@/data/sampleData";

const ctx: ClaimDocContext = { subContractSum: 111696, retentionPct: 10, retentionCapPct: 5, gstPct: 9 };

const baseClaim = (over: Partial<Claim> = {}): Claim => ({
  id: "c1", claimNumber: "CLM-E25077-1", projectId: "p1", projectCode: "E25077", projectName: "STA Phase 1",
  amount: 4843.8, claimNo: 1, totalClaim: null, certifiedAmount: null, remarks: "", gst: null, totalAmount: null,
  poRef: "", woRef: "", doRef: "", paymentTerms: "30 days", firstReleasePct: null, secondReleasePct: null,
  advancePayment: null, advanceRecovery: null, clientName: "HPC Builders Pte Ltd", clientAddress: "", contactPerson: "",
  contactNumber: "", submittedDate: "2026-09-08", claimDate: "2026-09-04", isFinal: false,
  retentionAmount: 538.2, retentionPct: 10, netAmount: null, status: "submitted", description: "", ...over,
});

const line = (over: Partial<ClaimLine>): ClaimLine => ({
  id: "l", claimId: "c1", section: "A", quotationRef: "Q1", seq: 1, pgRef: "A1", zone: "", description: "To Floor",
  unit: "m2", qty: 759, rate: 50, contractAmount: 37950, prevQty: 0, prevAmount: 0, currQty: 107.64,
  currAmount: 5382, cumQty: 107.64, cumAmount: 5382, verifiedQty: null, verifiedAmount: null, remarks: "", ...over,
});

describe("computeClaimTotals — retention rule", () => {
  it("derives retention from lines at the project rate (10% of work done)", () => {
    const t = computeClaimTotals(baseClaim({ lines: [line({})] }), ctx);
    expect(t.workDone).toBeCloseTo(5382, 2);
    expect(t.retention).toBeCloseTo(538.2, 2);
    expect(t.retentionSource).toBe("lines");
    expect(t.netAfterRetention).toBeCloseTo(4843.8, 2);
    expect(t.claimInclGst).toBeCloseTo(4843.8 * 1.09, 2);
  });

  it("caps retention at 5% of the sub-contract sum", () => {
    const big = line({ currQty: 2000, cumQty: 2000, currAmount: 100000, cumAmount: 100000 });
    const t = computeClaimTotals(baseClaim({ lines: [big] }), ctx);
    expect(t.retentionCapValue).toBeCloseTo(5584.8, 2);
    expect(t.retention).toBeCloseTo(5584.8, 2);
  });

  it("falls back to the stored retention_amount when the claim has no lines", () => {
    const t = computeClaimTotals(baseClaim({ lines: [] }), ctx);
    expect(t.retentionSource).toBe("stored");
    expect(t.retention).toBeCloseTo(538.2, 2);
    expect(t.workDone).toBeCloseTo(4843.8 + 538.2, 2);
    expect(t.netAfterRetention).toBeCloseTo(4843.8, 2);
  });

  it("uses total_claim as the gross when present and no lines exist", () => {
    const t = computeClaimTotals(baseClaim({ lines: [], totalClaim: 5382, retentionAmount: null }), ctx);
    expect(t.workDone).toBe(5382);
    expect(t.retention).toBeCloseTo(538.2, 2);
    expect(t.retentionSource).toBe("lines");
  });
});
