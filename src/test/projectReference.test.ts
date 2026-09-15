import { describe, expect, it } from "vitest";
import { baseCode, clientShort, consolidate, filterReport, parseReferenceSheet, tokenCounts, workBand, workTokens } from "@/lib/projectReference";
import type { RawCell } from "@/lib/inventoryImport";

const HEADER: RawCell[] = [
  "Project Code", "Sales Rep", "S/No.", "Project/Site", "Client", "Contract Value", "Total Claim Value", "Value of \nBalance Work", "Progress (%)",
  "Date of\nCommencement", "Date of\nCompletion", "Officer-In-Charge\n(TEL & FAX NO.)", "Scope / Description", "Quotation Ref.", "Supplier", "System",
  "STANDARDIZED TYPE OF WORK", "STANDARDIZED CODE", "FORMATT",
];

const row = (code: RawCell, rep: string, sno: number, site: string, client: string, cv: number, type: string, std: string, extra: Partial<Record<number, RawCell>> = {}): RawCell[] => {
  const r: RawCell[] = [code, rep, sno, site, client, cv, null, null, null, null, null, null, "Supply And Apply Of Epoxy Floor Coating System", null, "Sto", null, type, std, "#REF!"];
  for (const [k, v] of Object.entries(extra)) r[Number(k)] = v;
  return r;
};

describe("baseCode / tokens / band", () => {
  it("strips VO / revision suffixes and secondary codes", () => {
    expect(baseCode("E25077")).toBe("E25077");
    expect(baseCode("E25077 (VO)")).toBe("E25077");
    expect(baseCode("E18041 ( E )")).toBe("E18041");
    expect(baseCode("E19001 E18005")).toBe("E19001");
    expect(baseCode("9237/09")).toBe("9237/09");
    expect(baseCode("FE24021 (VO)")).toBe("FE24021");
    expect(baseCode(null)).toBeNull();
  });

  it("splits type of work into tokens and bands EPOXY vs MISC", () => {
    expect(workTokens("POWER FLOAT / HARDENER / EPOXY")).toEqual(["POWER FLOAT", "HARDENER", "EPOXY"]);
    expect(workBand("EPOXY / MARKING")).toBe("EPOXY");
    expect(workBand("PU / SCREEDING")).toBe("MISC");
    expect(workBand("EPOXY ")).toBe("EPOXY");
    expect(workBand(null)).toBe("UNCLASSIFIED");
  });

  it("shortens a client address block to the company name", () => {
    expect(clientShort("HPC Builders Pte Ltd\n7 Kung Chong Road, Level 5,\nSingapore 159144")).toBe("HPC Builders Pte Ltd");
    expect(clientShort("Chin Leong Construction Systems Pte Ltd 2 Tanjong Penjuru Singapore 609017")).toBe("Chin Leong Construction Systems Pte Ltd");
    expect(clientShort("RICH CONST")).toBe("RICH CONST");
  });
});

describe("parseReferenceSheet + consolidate", () => {
  const cells: RawCell[][] = [
    HEADER,
    row("E25077", "Wan Fern", 1014, "STA Singapore Phase 1", "HPC Builders Pte Ltd\n7 Kung Chong Road", 111696, "EPOXY", "CP01-EP", { 9: "TBA", 10: "TBA" }),
    row("E25077 (VO)", "Wan Fern", 1015, "STA Singapore Phase 1", "HPC Builders Pte Ltd", 5000, "EPOXY", "CP01-EP", { 9: new Date(Date.UTC(2026, 8, 1)) }),
    row("F25074", "Jensen", 1011, "Yokogawa @ 5 Bedok South Road", "Acolite Construction (S) Pte Ltd", 7784, "SCREEDING", "CP01-SC", { 9: new Date(Date.UTC(2025, 6, 1)) }),
    row(null, "Jensen", 3, "Old job without a code", "Somebody", 100, "HARDENER", "CP01-HD"),
    [null, null, null, null, null], // empty tail row
  ];
  const { rows, headerIndex } = parseReferenceSheet(cells);

  it("reads every entry, keeps dates only when they are dates", () => {
    expect(headerIndex).toBe(0);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ project_code: "E25077", base_code: "E25077", commencement: null, completion: null, standardized_code: "CP01-EP" });
    expect(rows[1].commencement).toBe("2026-09-01");
    expect(rows[3].project_code).toBeNull();
  });

  it("merges the VO into the base project and sums the contract value incl. VO", () => {
    const lines = consolidate(rows);
    expect(lines).toHaveLength(3);
    const sta = lines.find((l) => l.key === "E25077")!;
    expect(sta.codes).toEqual(["E25077", "E25077 (VO)"]);
    expect(sta.contract_value).toBe(111696);
    expect(sta.total_contract_value).toBe(116696);
    expect(sta.client).toBe("HPC Builders Pte Ltd");
    expect(sta.start_date).toBe("2026-09-01"); // first dated row wins when the base row has TBA
    expect(sta.band).toBe("EPOXY");
    expect(lines.find((l) => l.key.startsWith("site:"))!.project_name).toBe("Old job without a code");
  });

  it("filters by band, tokens, rep, year and search", () => {
    const lines = consolidate(rows);
    expect(filterReport(lines, { band: "EPOXY" }).map((l) => l.key)).toEqual(["E25077"]);
    expect(filterReport(lines, { band: "MISC" }).map((l) => l.key).sort()).toEqual(["F25074", "site:old job without a code"]);
    expect(filterReport(lines, { band: "ALL", tokens: ["SCREEDING"] }).map((l) => l.key)).toEqual(["F25074"]);
    expect(filterReport(lines, { band: "ALL", salesRep: "Jensen" })).toHaveLength(2);
    expect(filterReport(lines, { band: "ALL", yearFrom: 2026 }).map((l) => l.key)).toEqual(["E25077"]);
    expect(filterReport(lines, { band: "ALL", search: "yokogawa" }).map((l) => l.key)).toEqual(["F25074"]);
    expect(tokenCounts(lines).map((t) => t.token)).toEqual(["EPOXY", "HARDENER", "SCREEDING"]);
  });

  it("throws a readable error without the header", () => {
    expect(() => parseReferenceSheet([["Row Labels"], ["x"]])).toThrow(/header row/i);
  });
});
