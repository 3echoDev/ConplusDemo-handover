// Tax invoice for a certified progress claim — the stage between the Certificate
// chase and the Payment chase (Accounts' "Account Dashboard" spec, 21 + 24 Sep 2026).
//
// Pure module (no DOM, no Supabase): buildInvoiceDraft() turns the claim, its
// project, the project's earlier claims and the claim lines into an editable
// InvoiceDraft that mirrors Accounts' "Invoice Template.xlsm"; computeInvoiceTotals()
// gives the figures on page 1 and buildRetentionSchedule() the page-2 table.

export const CONPLUS_GST_REG = "19-9404220-W";
export const DEFAULT_GST_PCT = 9;

export interface InvoiceItem {
  label: string; // "ITEM 1"
  text: string; // bold subtitle from the quotation, editable
  include: boolean; // Accounts can leave a line off (customer asked to omit it)
}

export interface QuoteBlock {
  kind: "main" | "vo";
  quoteRef: string;
  items: InvoiceItem[];
}

export interface RetentionRow {
  label: string; // "Payment Certificate No.1"
  certified: number; // gross certified in that certificate
  retention: number; // retention held on it (positive)
}

export interface InvoiceDraft {
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  clientName: string;
  addressLines: string[]; // up to 3 lines under "To:"
  attn: string;
  email: string;
  site: string;
  jobRef: string; // project code
  paymentCert: string;
  claimNos: string;
  paymentTerms: string;
  customerPo: string;
  quoteBlocks: QuoteBlock[];
  workDone: string; // "Aug'26"
  cumCertified: number; // Total Value of Certified, gross, to date
  retentionPct: number; // 10
  retentionCapPct: number | null; // 5 (% of contract sum)
  contractSum: number | null;
  retentionOverride: number | null; // Accounts' figure when the certificate differs
  paymentReceived: number; // earlier certificates' payment claims (positive)
  gstPct: number;
  retentionRows: RetentionRow[];
}

export interface InvoiceTotals {
  cumCertified: number;
  retention: number; // positive
  retentionCap: number | null;
  paymentReceived: number; // positive
  totalAmount: number;
  gst: number;
  totalDue: number;
}

/* ── Inputs (rows as Supabase returns them) ─────────────────────── */

export interface InvoiceClaimRow {
  id: string;
  claim_no: number | null;
  claim_date: string | null;
  project_code: string | null;
  project_name: string | null;
  client_name: string | null;
  client_address: string | null;
  contact_person: string | null;
  amount: number | string | null;
  certified_amount: number | string | null;
  payment_terms: string | null;
  po_ref: string | null;
  wo_ref?: string | null;
  wo_po_ref?: string | null;
}

export interface InvoiceProjectRow {
  project_code: string | null;
  name: string | null;
  location?: string | null;
  scope?: string | null;
  quotation_ref: string | null;
  contract_value: number | string | null;
  total_contract_value: number | string | null;
  retention_pct: number | string | null;
  retention_cap_pct: number | string | null;
  payment_terms_days: number | null;
  client_po: string | null;
  contact_email: string | null;
  contact_person?: string | null;
}

export interface InvoiceLineRow {
  section: string | null; // "A" main contract, "B" variation works
  quotation_ref: string | null;
  seq: number | null;
  description: string | null;
}

export interface BuildInvoiceInput {
  claim: InvoiceClaimRow;
  project: InvoiceProjectRow;
  /** Every claim of the project (any order); earlier certified claims feed page 2 + "Payment Received". */
  projectClaims: InvoiceClaimRow[];
  lines: InvoiceLineRow[];
  nextRunningNo: number | null;
  today?: string; // YYYY-MM-DD, for tests
}

/* ── Helpers ────────────────────────────────────────────────────── */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Trimmed text, or "" for blanks and placeholders such as "-", "N/A", "NIL — LOA pending". */
const clean = (v: string | null | undefined): string => {
  const s = (v ?? "").trim();
  return !s || /^(-+|—|n\/?a|nil\b.*|tba)$/i.test(s) ? "" : s;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "<running>/<YYYY>/<MM>" — Accounts' numbering (e.g. 320014/2026/09). */
export function invoiceNumberFor(running: number | null, isoDate: string): string {
  const [y, m] = isoDate.split("-");
  return `${running ?? ""}/${y}/${m}`;
}

/** Work month of a claim = the month before it was submitted (same rule as the claim's
 * Reference Period), e.g. claim dated 4 Sep 2026 -> "Aug'26". */
export function workDoneLabel(claimDate: string | null | undefined): string {
  if (!claimDate) return "";
  const [y, m] = claimDate.split("-").map(Number);
  if (!y || !m) return "";
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${MONTHS[d.getUTCMonth()]}'${String(d.getUTCFullYear()).slice(2)}`;
}

/** Split a one-line address into at most three printable lines. */
export function splitAddress(address: string | null | undefined): string[] {
  if (!address) return [];
  const parts = address.includes("\n")
    ? address.split(/\r?\n/)
    : address.split(/,\s*/);
  const clean = parts.map((s) => s.trim()).filter(Boolean);
  if (clean.length <= 3) return clean;
  return [clean.slice(0, clean.length - 2).join(", "), clean[clean.length - 2], clean[clean.length - 1]];
}

/** Bold subtitle of a claim line: the first line of its description ("To Floor - Confine Space"). */
export function lineHeading(description: string | null | undefined): string {
  const first = (description || "").split(/\r?\n/)[0].trim();
  return first.replace(/\s+/g, " ").replace(/[:;,.]+$/, "");
}

/** Quotation blocks from the claim lines: section A under the project's quotation ref,
 * each variation quotation (section B) as its own VO block; one item per distinct heading. */
export function buildQuoteBlocks(project: InvoiceProjectRow, lines: InvoiceLineRow[]): QuoteBlock[] {
  const sorted = [...lines].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const blocks: QuoteBlock[] = [];
  const blockFor = (kind: "main" | "vo", ref: string) => {
    let b = blocks.find((x) => x.kind === kind && x.quoteRef === ref);
    if (!b) {
      b = { kind, quoteRef: ref, items: [] };
      blocks.push(b);
    }
    return b;
  };
  for (const l of sorted) {
    const kind = (l.section || "A").toUpperCase() === "B" ? "vo" : "main";
    const ref = (l.quotation_ref || (kind === "main" ? project.quotation_ref : "") || "").trim();
    const heading = lineHeading(l.description);
    if (!heading) continue;
    const b = blockFor(kind, ref);
    if (!b.items.some((i) => i.text.toLowerCase() === heading.toLowerCase())) {
      b.items.push({ label: `ITEM ${b.items.length + 1}`, text: heading, include: true });
    }
  }
  if (!blocks.some((b) => b.kind === "main")) {
    const fallback = (project.scope || project.name || "").trim();
    blocks.unshift({
      kind: "main",
      quoteRef: (project.quotation_ref || "").trim(),
      items: fallback ? [{ label: "ITEM 1", text: fallback, include: true }] : [],
    });
  }
  // main contract first, then VOs in the order they appear
  return [...blocks.filter((b) => b.kind === "main"), ...blocks.filter((b) => b.kind === "vo")];
}

/** Renumber the ITEM labels of a block after lines are removed or added. */
export function relabelItems(items: InvoiceItem[]): InvoiceItem[] {
  let n = 0;
  return items.map((i) => (i.include ? { ...i, label: `ITEM ${++n}` } : { ...i, label: "" }));
}

/* ── Money ──────────────────────────────────────────────────────── */

export function retentionCapAmount(d: Pick<InvoiceDraft, "retentionCapPct" | "contractSum">): number | null {
  if (d.retentionCapPct == null || d.contractSum == null || !(d.contractSum > 0)) return null;
  return round2((d.contractSum * d.retentionCapPct) / 100);
}

/** Retention on page 1 before any override: the page-2 column total when there is a
 * schedule (so both pages agree to the cent), else the % of certified, capped. */
export function defaultRetention(d: InvoiceDraft): number {
  if (d.retentionRows.length) return buildRetentionSchedule(d.retentionRows).total.retention;
  const cap = retentionCapAmount(d);
  const raw = round2((d.cumCertified * d.retentionPct) / 100);
  return cap != null ? Math.min(raw, cap) : raw;
}

export function computeInvoiceTotals(d: InvoiceDraft): InvoiceTotals {
  const cap = retentionCapAmount(d);
  const retention = d.retentionOverride != null ? round2(d.retentionOverride) : defaultRetention(d);
  const totalAmount = round2(d.cumCertified - retention - d.paymentReceived);
  const gst = round2((totalAmount * d.gstPct) / 100);
  return {
    cumCertified: round2(d.cumCertified),
    retention,
    retentionCap: cap,
    paymentReceived: round2(d.paymentReceived),
    totalAmount,
    gst,
    totalDue: round2(totalAmount + gst),
  };
}

export interface RetentionScheduleRow extends RetentionRow {
  payment: number;
}

export function buildRetentionSchedule(rows: RetentionRow[]) {
  const out: RetentionScheduleRow[] = rows.map((r) => ({ ...r, payment: round2(r.certified - r.retention) }));
  const sum = (k: "certified" | "retention" | "payment") => round2(out.reduce((s, r) => s + r[k], 0));
  return { rows: out, total: { certified: sum("certified"), retention: sum("retention"), payment: sum("payment") } };
}

/**
 * Retention rows for page 2: one per certified claim up to this one. Stored certified
 * amounts are NET of retention (what the main contractor pays), so the gross is
 * net / (1 − r); retention accrues on the cumulative gross until the cap is reached.
 */
export function defaultRetentionRows(
  certifiedNet: { claimNo: number | null; net: number }[],
  retentionPct: number,
  cap: number | null,
): RetentionRow[] {
  const r = retentionPct / 100;
  let cumRet = 0;
  return certifiedNet.map((c, i) => {
    // gross such that gross - retention(gross) = net, honouring the cap. Rounded per
    // row and accumulated rounded, so the column adds up to exactly the cap once it
    // is reached and every row's payment claim equals the certified net.
    let ret = round2(r < 1 ? (c.net / (1 - r)) * r : 0);
    if (cap != null && round2(cumRet + ret) > cap) ret = Math.max(round2(cap - cumRet), 0);
    cumRet = round2(cumRet + ret);
    return { label: `Payment Certificate No.${i + 1}`, certified: round2(c.net + ret), retention: ret };
  });
}

/* ── Default draft ──────────────────────────────────────────────── */

export function buildInvoiceDraft(input: BuildInvoiceInput): InvoiceDraft {
  const { claim, project } = input;
  const today = input.today ?? todayIso();
  const retentionPct = num(project.retention_pct) ?? 10;
  const retentionCapPct = num(project.retention_cap_pct);
  const contractSum = num(project.total_contract_value) ?? num(project.contract_value);
  const thisNo = claim.claim_no ?? Number.MAX_SAFE_INTEGER;

  const certified = input.projectClaims
    .filter((c) => c.claim_no != null && c.claim_no <= thisNo && num(c.certified_amount) != null)
    .sort((a, b) => (a.claim_no ?? 0) - (b.claim_no ?? 0));
  // make sure this claim is in (its claim_no may be null)
  if (!certified.some((c) => c.id === claim.id) && num(claim.certified_amount) != null) certified.push(claim);

  const cap = retentionCapAmount({ retentionCapPct, contractSum });
  const retentionRows = defaultRetentionRows(
    certified.map((c) => ({ claimNo: c.claim_no, net: num(c.certified_amount) ?? 0 })),
    retentionPct,
    cap,
  );
  const schedule = buildRetentionSchedule(retentionRows);
  const prevPayments = round2(schedule.rows.slice(0, -1).reduce((s, r) => s + r.payment, 0));

  // Details come from the progress claim; when this claim left one blank, the latest
  // earlier claim of the project that has it (the To block rarely changes claim to claim).
  const pick = (get: (c: InvoiceClaimRow) => string | null | undefined): string => {
    const own = clean(get(claim));
    if (own) return own;
    const earlier = [...input.projectClaims]
      .filter((c) => c.id !== claim.id && (c.claim_no ?? 0) <= thisNo)
      .sort((a, b) => (b.claim_no ?? 0) - (a.claim_no ?? 0));
    for (const c of earlier) {
      const v = clean(get(c));
      if (v) return v;
    }
    return "";
  };
  const terms = pick((c) => c.payment_terms)
    || (project.payment_terms_days != null ? `${project.payment_terms_days} DAYS` : "");
  const thisCert = certified.findIndex((c) => c.id === claim.id);

  return {
    invoiceNumber: invoiceNumberFor(input.nextRunningNo, today),
    invoiceDate: today,
    clientName: pick((c) => c.client_name),
    addressLines: splitAddress(pick((c) => c.client_address)),
    attn: pick((c) => c.contact_person) || project.contact_person || "",
    email: project.contact_email || "",
    site: project.name || claim.project_name || "",
    jobRef: claim.project_code || project.project_code || "",
    // the main contractor's certificate number = this claim's place in the page-2 schedule
    paymentCert: thisCert >= 0 ? String(thisCert + 1) : "",
    claimNos: claim.claim_no != null ? String(claim.claim_no).padStart(2, "0") : "",
    paymentTerms: terms.toUpperCase(),
    customerPo: clean(project.client_po) || pick((c) => c.po_ref || c.wo_po_ref || c.wo_ref),
    quoteBlocks: buildQuoteBlocks(project, input.lines),
    workDone: workDoneLabel(claim.claim_date),
    cumCertified: schedule.total.certified,
    retentionPct,
    retentionCapPct,
    contractSum,
    retentionOverride: null,
    paymentReceived: prevPayments,
    gstPct: DEFAULT_GST_PCT,
    retentionRows,
  };
}

/** Does page 1 tally with the certificate? total before GST should equal the certified (net) amount. */
export function tallyWithCertificate(d: InvoiceDraft, certifiedNet: number | null): { ok: boolean; diff: number } {
  if (certifiedNet == null) return { ok: false, diff: NaN };
  const diff = round2(computeInvoiceTotals(d).totalAmount - certifiedNet);
  return { ok: Math.abs(diff) < 0.01, diff };
}

export function retentionLabel(d: Pick<InvoiceDraft, "retentionPct" | "retentionCapPct">): string {
  const pct = `${Number(d.retentionPct.toFixed(2))}%`;
  return d.retentionCapPct != null
    ? `Less: ${pct} Retention (Capped at ${Number(d.retentionCapPct.toFixed(2))}% of Contract Sum)`
    : `Less: ${pct} Retention`;
}

/* ── Amount in words (the template's SpellNumber macro) ─────────── */

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function words999(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`);
  return parts.join(" ");
}

function intWords(n: number): string {
  if (n === 0) return "Zero";
  const scales = ["", " Thousand", " Million", " Billion"];
  const parts: string[] = [];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(words999(chunk) + scales[i]);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(" ");
}

/** 8829 -> "Eight Thousand Eight Hundred Twenty Nine Only";
 *  12637.24 -> "Twelve Thousand Six Hundred Thirty Seven and Cents Twenty Four Only". */
export function spellAmount(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const dollars = Math.floor(cents / 100);
  const c = cents % 100;
  const neg = amount < 0 ? "Minus " : "";
  return `${neg}${intWords(dollars)}${c ? ` and Cents ${intWords(c)}` : ""} Only`;
}
