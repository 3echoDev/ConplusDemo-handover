import { describe, expect, it } from "vitest";
import {
  cleanScope,
  crewFromAllocation,
  nextToolNo,
  orderChip,
  placesOn,
  projectHeadline,
  scheduleDates,
  scopeArea,
  stageDesc,
  stageName,
  stageState,
  STAGES,
  syncTransferTools,
  toolsUsedOn,
  transferReady,
  usedDaysSinceService,
  type Allocation,
  type SiteOrder,
  type SiteWorker,
} from "@/lib/siteOrders";

const order = (p: Partial<SiteOrder> = {}): SiteOrder => ({
  id: "o1",
  project_id: "p1",
  project_code: "E25028",
  order_no: 1,
  label: "Phase 1",
  scope: [],
  remarks: null,
  stage: 2,
  kickoff: null,
  site_walk: null,
  transfer: null,
  completion: null,
  completed_at: null,
  ...p,
});

const alloc = (p: Partial<Allocation>): Allocation => ({
  id: Math.random().toString(36),
  order_id: "o1",
  project_id: "p1",
  work_date: "2026-11-16",
  worker_id: null,
  tool_id: null,
  attendance: "Full Day",
  ot_hours: null,
  ...p,
});

describe("stage sequence", () => {
  it("is the mockup's seven stages, starting with Project Plan", () => {
    expect([...STAGES]).toEqual(["Project Plan", "Kick Off", "Schedule Posting", "Deployment & Execution", "Site Walk / Handover", "Transfer / Movement", "Completion"]);
    expect(stageName(1)).toBe("Project Plan");
    expect(stageName(7)).toBe("Completion");
  });

  it("a new order has Project Plan done and Kick Off current", () => {
    const o = order();
    expect(stageState(o, 1)).toBe("done");
    expect(stageState(o, 2)).toBe("active");
    expect(stageState(o, 3)).toBe("locked");
    expect(stageDesc(o, 1)).toBe("Order created");
    expect(stageDesc(o, 2)).toBe("Not started");
    expect(stageDesc(o, 5)).toBe("Upcoming");
  });

  it("Completion is active at stage 7 until it is completed", () => {
    expect(stageState(order({ stage: 7 }), 7)).toBe("active");
    expect(stageState(order({ stage: 7, completed_at: "2026-11-20T00:00:00Z" }), 7)).toBe("done");
    expect(orderChip(order({ stage: 7, completed_at: "x" }))).toEqual({ tone: "good", text: "Completed" });
  });

  it("Transfer reads Pending until every tool is received", () => {
    const o = order({ stage: 6, transfer: { move_date: "2026-11-18", tools: [{ tool_id: "t1", destination: "Store", site: "", received_by: "", acknowledged: false }] } });
    expect(stageDesc(o, 6)).toBe("Pending");
  });

  it("a project's chip is its least advanced open order", () => {
    expect(projectHeadline([])).toEqual({ tone: "pending", text: "No orders" });
    expect(projectHeadline([order({ stage: 5 }), order({ id: "o2", stage: 3 })]).text).toBe("Schedule Posting");
    expect(projectHeadline([order({ stage: 7, completed_at: "x" })]).text).toBe("Completed");
    expect(projectHeadline([order({ stage: 7, completed_at: "x" }), order({ id: "o2", stage: 4 })]).text).toBe("Deployment & Execution");
  });
});

describe("scope and schedule", () => {
  it("drops blank scope rows and totals the area", () => {
    const rows = cleanScope([
      { scope: " Grinding ", area: "850" },
      { scope: "", area: "20" },
      { scope: "Sanding", area: "" },
    ]);
    expect(rows).toEqual([
      { scope: "Grinding", area: "850" },
      { scope: "Sanding", area: "" },
    ]);
    expect(scopeArea(rows)).toBe(850);
  });

  it("generates one date per day, across a month end", () => {
    expect(scheduleDates("2026-11-29", 4)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(scheduleDates("2026-11-29", 0)).toEqual([]);
  });
});

describe("where people and tools are", () => {
  const orders = [order(), order({ id: "o2", project_id: "p2", project_code: "F25040", label: "L3" })];

  it("only that day's allocations count, so the next day starts empty", () => {
    const allocs = [alloc({ worker_id: "w1" }), alloc({ tool_id: "t1" }), alloc({ worker_id: "w2", work_date: "2026-11-15" })];
    const today = placesOn(allocs, orders, "2026-11-16", "worker");
    expect(today.get("w1")?.map((p) => p.project_code)).toEqual(["E25028"]);
    expect(today.has("w2")).toBe(false);
    expect(placesOn(allocs, orders, "2026-11-17", "worker").size).toBe(0);
    expect(placesOn(allocs, orders, "2026-11-17", "tool").size).toBe(0);
    expect(placesOn(allocs, orders, "2026-11-16", "tool").get("t1")?.[0].label).toBe("Phase 1");
  });

  it("a worker split over two orders shows both", () => {
    const allocs = [alloc({ worker_id: "w1", attendance: "Half AM" }), alloc({ worker_id: "w1", order_id: "o2", project_id: "p2", attendance: "Half PM" })];
    expect(placesOn(allocs, orders, "2026-11-16", "worker").get("w1")?.map((p) => `${p.project_code} ${p.attendance}`)).toEqual(["E25028 Half AM", "F25040 Half PM"]);
  });

  it("counts a tool's working days after its last service", () => {
    const days = [
      { tool_id: "t1", work_date: "2026-08-30" },
      { tool_id: "t1", work_date: "2026-09-02" },
      { tool_id: "t1", work_date: "2026-09-02" },
      { tool_id: "t1", work_date: "2026-09-03" },
      { tool_id: "t2", work_date: "2026-09-03" },
    ];
    expect(usedDaysSinceService(days, "t1", "2026-09-01")).toBe(2);
    expect(usedDaysSinceService(days, "t1", null)).toBe(3);
  });

  it("builds the daily report crew from the allocation, by designation", () => {
    const workers: SiteWorker[] = [
      { id: "w1", emp_code: "168", name: "RAMARAJAN", designation: "Supervisor", contact: null, active: true },
      { id: "w2", emp_code: "113", name: "MOORTHY", designation: "Foreman/Safety", contact: null, active: true },
      { id: "w3", emp_code: "67", name: "MURUGANANTHAM", designation: "Skilled Worker", contact: null, active: true },
      { id: "w4", emp_code: null, name: "Supply Man", designation: "General Worker", contact: null, active: true },
    ];
    const allocs = [alloc({ worker_id: "w1" }), alloc({ worker_id: "w2" }), alloc({ worker_id: "w3" }), alloc({ worker_id: "w4" }), alloc({ worker_id: "w3", order_id: "o9" }), alloc({ tool_id: "t1" })];
    expect(crewFromAllocation(allocs, workers, "2026-11-16", "p1")).toEqual({
      crew: { supervisor: "168", safety_personnel: "113", men: "67, Supply Man", supply_men: "" },
      total: 4,
    });
    expect(crewFromAllocation(allocs, workers, "2026-11-17", "p1")).toBeNull();
  });
});

describe("transfer", () => {
  it("lists every tool the order used, once, and keeps what was entered", () => {
    const used = toolsUsedOn([alloc({ tool_id: "t1" }), alloc({ tool_id: "t1", work_date: "2026-11-17" }), alloc({ tool_id: "t2" }), alloc({ worker_id: "w1" })], "o1");
    expect(used).toEqual(["t1", "t2"]);
    const synced = syncTransferTools([{ tool_id: "t1", destination: "Store", site: "", received_by: "Praba", acknowledged: true }], used);
    expect(synced).toHaveLength(2);
    expect(synced[0].received_by).toBe("Praba");
    expect(synced[1]).toEqual({ tool_id: "t2", destination: "", site: "", received_by: "", acknowledged: false });
  });

  it("is ready only with a date and every tool received", () => {
    const tool = { tool_id: "t1", destination: "Store" as const, site: "", received_by: "Praba", acknowledged: true };
    expect(transferReady(null)).toBe(false);
    expect(transferReady({ move_date: "2026-11-18", tools: [] })).toBe(true);
    expect(transferReady({ move_date: "2026-11-18", tools: [tool] })).toBe(true);
    expect(transferReady({ move_date: "2026-11-18", tools: [{ ...tool, acknowledged: false }] })).toBe(false);
    expect(transferReady({ move_date: "2026-11-18", tools: [{ ...tool, destination: "Another site" }] })).toBe(false);
    expect(transferReady({ move_date: "", tools: [tool] })).toBe(false);
  });
});

describe("tool numbers", () => {
  const existing = ["CP-OT-12", "CP-OT-13", "CP-OT-14", "CP-850-01", "CP-850-02"];
  it("suggests the next free number for a prefix", () => {
    expect(nextToolNo(existing, "CP-OT")).toBe("CP-OT-15");
    expect(nextToolNo(existing, "cp-850")).toBe("CP-850-03");
    expect(nextToolNo(existing, "CP-NEW")).toBe("CP-NEW-01");
    expect(nextToolNo(existing, "")).toBe("");
  });
});
