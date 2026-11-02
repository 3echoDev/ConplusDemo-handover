// Tax invoice for a SUPPLY OF MATERIALS job — Accounts' second invoice format
// ("Account - Invoice.xlsx", sheet "Invoice - 2nd Format Request", 2 Nov 2026):
// header with the customer's PO no., our WO no. and DO no., JOB REF = quotation no.,
// then an item table (S/NO · DESCRIPTION · PRICE/UNIT · QTY · unit · TOTAL) under a
// "Supply of Material:" subtitle, Sub-Total, GST, Total Balance Due, one page.
//
// Pure module: buildMaterialInvoiceDraft() turns a Works Order into an editable
// draft; computeMaterialTotals() gives the figures. Sheet + print in
// materialInvoiceExcel.ts.
import type { WorksOrder, WorksOrderLine } from "@/data/sampleData";
import { qtyUnitLabel } from "@/lib/woDocument";
import { invoiceNumberFor, round2, spellAmount, splitAddress, todayIso, DEFAULT_GST_PCT } from "@/lib/invoiceDocument";

/** Accounts' wording on this format: "One Hundred Ninety Six Dollars and Twenty Cents"
 * (the progress-claim invoice keeps its template's "… and Cents Twenty Only"). */
export function spellAmountDollars(amount: number): string {
  const base = spellAmount(amount).replace(/ Only$/, "");
  const [dollars, cents] = base.split(" and Cents ");
  return cents ? `${dollars} Dollars and ${cents} Cents` : `${dollars} Dollars`;
}

export interface MaterialInvoiceLine {
  description: string;
  unitPrice: number | null;
  qty: number | null;
  unit: string; // "set", "bag", "kg"…
}

export interface MaterialInvoiceDraft {
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  clientName: string;
  addressLines: string[];
  attn: string;
  tel: string;
  poNo: string; // customer's Purchase Order no.
  woNo: string; // our Work Order no.
  doNo: string; // Delivery Order no.
  jobRef: string; // quotation no.
  paymentTerms: string;
  site: string;
  subtitle: string; // "Supply of Material:"
  lines: MaterialInvoiceLine[];
  gstPct: number;
}

export interface MaterialInvoiceTotals {
  lineTotals: number[];
  subTotal: number;
  gst: number;
  totalDue: number;
}

export const lineTotal = (l: MaterialInvoiceLine): number => round2((l.unitPrice ?? 0) * (l.qty ?? 0));

export function computeMaterialTotals(d: MaterialInvoiceDraft): MaterialInvoiceTotals {
  const lineTotals = d.lines.map(lineTotal);
  const subTotal = round2(lineTotals.reduce((s, n) => s + n, 0));
  const gst = round2((subTotal * d.gstPct) / 100);
  return { lineTotals, subTotal, gst, totalDue: round2(subTotal + gst) };
}

/** Order lines of a WO as invoice lines: top-level lines only (mix components and nested
 * variants roll up under their parent), the ordered qty, counted in packs. */
export function materialLinesFromWO(wo: WorksOrder): MaterialInvoiceLine[] {
  const out: MaterialInvoiceLine[] = [];
  for (const area of wo.areas) {
    for (const l of area.lines) {
      if (l.isMixComponent || l.parentLineId) continue;
      const qty = l.orderQty != null ? l.orderQty : l.requiredQty;
      out.push({
        description: lineDescription(l),
        unitPrice: l.unitPrice,
        qty,
        unit: qtyUnitLabel(l, 1), // singular label like the sample ("set")
      });
    }
  }
  return out;
}

/** "StoPox WL100 (RAL 7040)" — the product plus its colour when there is one. */
export function lineDescription(l: Pick<WorksOrderLine, "description" | "colour">): string {
  const d = (l.description || "").trim();
  const c = (l.colour || "").trim();
  return c && !d.toLowerCase().includes(c.toLowerCase()) ? `${d} (${c})` : d;
}

export interface BuildMaterialInvoiceInput {
  wo: WorksOrder;
  project?: { payment_terms_days?: number | null; client_po?: string | null; client_address?: string | null; name?: string | null } | null;
  nextRunningNo: number | null;
  today?: string;
}

export function buildMaterialInvoiceDraft(input: BuildMaterialInvoiceInput): MaterialInvoiceDraft {
  const { wo, project } = input;
  const today = input.today ?? todayIso();
  const terms = project?.payment_terms_days != null ? `${project.payment_terms_days} DAYS` : "";
  return {
    invoiceNumber: invoiceNumberFor(input.nextRunningNo, today),
    invoiceDate: today,
    clientName: wo.clientName || "",
    addressLines: splitAddress(project?.client_address ?? null),
    attn: wo.contactPerson || "",
    tel: wo.contactNumber || "",
    poNo: (project?.client_po || "").trim(),
    woNo: wo.woNumber || "",
    doNo: "",
    jobRef: wo.quotationRef || wo.jobNo || "",
    paymentTerms: terms.toUpperCase(),
    site: wo.siteAddress || project?.name || "",
    subtitle: "Supply of Material:",
    lines: materialLinesFromWO(wo),
    gstPct: DEFAULT_GST_PCT,
  };
}
