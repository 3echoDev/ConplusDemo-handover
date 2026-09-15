import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  PLACEHOLDERS,
  TEMPLATE_META,
  renderChaseTemplate,
  renderTemplate,
  resolveTemplate,
  unknownPlaceholders,
} from "@/lib/chaseTemplates";

describe("chase templates", () => {
  it("has a default for every template the editor lists, and only known placeholders", () => {
    for (const m of TEMPLATE_META) {
      const t = DEFAULT_TEMPLATES[m.key];
      expect(t, m.key).toBeDefined();
      expect(unknownPlaceholders(t.subject + t.body), m.key).toEqual([]);
    }
    expect(PLACEHOLDERS.map((p) => p.name)).toContain("{signature}");
  });

  it("renders placeholders and leaves unknown ones visible", () => {
    expect(renderTemplate("Claim {claim_no} for {project} — {nope}", { claim_no: 3, project: "MOE (E25057)" })).toBe("Claim 3 for MOE (E25057) — {nope}");
    expect(renderTemplate("{amount}", { amount: null })).toBe("{amount}");
  });

  it("prefers a stored override over the default", () => {
    const overrides = { "cert.overdue": { subject: "PRC overdue: {project_code} #{claim_no}", body: "Please issue the PRC for claim {claim_no}." } };
    expect(resolveTemplate("cert.overdue", overrides)?.subject).toContain("PRC overdue");
    expect(resolveTemplate("cert.due", overrides)).toEqual(DEFAULT_TEMPLATES["cert.due"]);
    const out = renderChaseTemplate("cert.overdue", overrides, { project_code: "E25057", claim_no: 1 });
    expect(out).toEqual({ subject: "PRC overdue: E25057 #1", body: "Please issue the PRC for claim 1." });
    expect(renderChaseTemplate("cert.nope", overrides, {})).toBeNull();
  });

  it("keeps the client's verbatim payment wording in the defaults", () => {
    expect(DEFAULT_TEMPLATES["pay.1st"].body).toContain("Please be informed that your account is long OVERDUE.");
    expect(DEFAULT_TEMPLATES["pay.final.legal"].body).toContain("commence legal proceedings");
    expect(DEFAULT_TEMPLATES["pay.soa"].body.endsWith("{signature}")).toBe(true);
  });
});
