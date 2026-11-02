// Chase email templates: built-in defaults + per-key overrides from the
// chase_templates table, rendered with {placeholders}.
//
// Certificate-clock wording was drafted by us; payment-clock wording is the
// client's verbatim text from their "Account – Payment-Chase Setup" workbook.
// Both can now be edited on the Chase page (Email templates) — an edit is
// stored as a row in chase_templates and wins over the default here.
//
// Erasable-syntax TypeScript only: unit tests import this file directly.

export interface ChaseTemplate {
  subject: string;
  body: string;
}

export interface TemplateMeta {
  key: string;
  clock: "certificate" | "payment";
  label: string;
  when: string;
}

/** The order the editor shows them in. */
export const TEMPLATE_META: TemplateMeta[] = [
  { key: "cert.t-4", clock: "certificate", label: "Certificate — 4 days before due", when: "PRC due in 4 days" },
  { key: "cert.due", clock: "certificate", label: "Certificate — due today", when: "PRC due today" },
  { key: "cert.overdue", clock: "certificate", label: "Certificate — overdue", when: "every 7 days after the PRC due date" },
  { key: "pay.invoice", clock: "payment", label: "Payment — Invoice (tax invoice sent)", when: "when Accounts sends the tax invoice; picked on the card" },
  { key: "pay.soa", clock: "payment", label: "Payment — Statement of Account", when: "day the invoice is issued" },
  { key: "pay.soa_overdue", clock: "payment", label: "Payment — SOA overdue", when: "14 / 21 / 28 days overdue" },
  { key: "pay.1st", clock: "payment", label: "Payment — 1st reminder", when: "35 days overdue" },
  { key: "pay.2nd", clock: "payment", label: "Payment — 2nd reminder", when: "42 days overdue" },
  { key: "pay.final.legal", clock: "payment", label: "Payment — final (legal action)", when: "49 days overdue, QS picks" },
  { key: "pay.final.termination", clock: "payment", label: "Payment — final (work termination)", when: "49 days overdue, QS picks" },
];

export const PLACEHOLDERS: { name: string; means: string }[] = [
  { name: "{claim_no}", means: "claim number on the project, e.g. 3" },
  { name: "{project}", means: "project name and code, e.g. MOE Building (E25057)" },
  { name: "{project_name}", means: "project name only" },
  { name: "{project_code}", means: "project code only" },
  { name: "{submitted_on}", means: "date the claim was submitted" },
  { name: "{amount}", means: "claim amount, e.g. $360.13" },
  { name: "{due_date}", means: "PRC or payment due date" },
  { name: "{days_over}", means: "days past due" },
  { name: "{contact}", means: "client contact name, or Sir/Madam" },
  { name: "{deadline}", means: "payment deadline = last reminder + 7 days" },
  { name: "{outstanding}", means: "outstanding amount, e.g. SGD 60,527.01" },
  { name: "{signature}", means: "Best regards + sales manager + company" },
  { name: "{as_at}", means: "today's date, e.g. 05 Oct 2026 (the SOA 'as at' date)" },
];

/**
 * The templates Accounts pick from on a Payment chase card (their list, 2 Nov 2026):
 * 1 Invoice, 2 Standard SOA, 3 1st Reminder, 4 2nd Reminder, 5 Final Reminder.
 */
export const PAYMENT_TEMPLATE_CHOICES: { key: string; label: string }[] = [
  { key: "pay.invoice", label: "1. Invoice Template" },
  { key: "pay.soa", label: "2. Standard Statement of Account (SOA)" },
  { key: "pay.1st", label: "3. 1st Reminder" },
  { key: "pay.2nd", label: "4. 2nd Reminder" },
  { key: "pay.final.legal", label: "5. Final Reminder" },
];

const SIG = "{signature}";

export const DEFAULT_TEMPLATES: Record<string, ChaseTemplate> = {
  "cert.t-4": {
    subject: "Payment Response Certificate — {project_name} (Claim {claim_no})",
    body: "Dear Sir/Madam,\n\nWe refer to our Progress Claim {claim_no} for {project}, submitted on {submitted_on} for {amount}.\n\nThe Payment Response Certificate is due by {due_date}. We would appreciate it if you could arrange for the certificate to be issued by the due date.\n\nThank you.",
  },
  "cert.due": {
    subject: "Payment Response Certificate Due Today — {project_name}",
    body: "Dear Sir/Madam,\n\nWe refer to our Progress Claim {claim_no} for {project}, submitted on {submitted_on} for {amount}.\n\nThe Payment Response Certificate is due today ({due_date}). Kindly arrange for the certificate to be issued. Please let us know if you require any further information.\n\nThank you.",
  },
  "cert.overdue": {
    subject: "Overdue: Payment Response Certificate — {project_name} (Claim {claim_no})",
    body: "Dear Sir/Madam,\n\nWe refer to our Progress Claim {claim_no} for {project}, submitted on {submitted_on} for {amount}.\n\nThe Payment Response Certificate was due on {due_date} and is now {days_over} days overdue. We would be grateful if you could arrange for it to be issued at the earliest, or advise us of the expected date.\n\nThank you.",
  },
  // Accounts' "Email Templates" sheet (2 Nov 2026), verbatim apart from the placeholders.
  "pay.invoice": {
    subject: "Tax Invoice — {project_name} ({project_code})",
    body: `Dear {contact},\n\nGood day.\n\nWe are pleased to submit our tax invoice for your perusal.\n\nPlease be informed that we will stop printing and mailing hardcopy invoice in an effort to Go-Green w.e.f 1st November 2023.\nIf you are unable to download the attached, please contact us @ 6753 9939 or email to accounts@conplus.com.sg\n\nThank you.${SIG}`,
  },
  "pay.soa": {
    subject: "Statement of Account — {project_name} ({project_code})",
    body: `Dear {contact},\n\nGood day.\n\nPlease refer to the attached herewith the SOA for your reference.\n\nThank you.${SIG}`,
  },
  "pay.soa_overdue": {
    subject: "OVERDUE — Statement of Account for {project_name} ({days_over} days overdue)",
    body: `Dear {contact},\n\nGood day.\n\nPlease refer to the attached herewith the SOA for your reference.\n\nMay I seek your kind assistance to check the payment status for the outstanding invoice please.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.${SIG}`,
  },
  "pay.1st": {
    subject: "1st REMINDER — Payment overdue for {project_name} ({days_over} days)",
    body: `Dear {contact},\n\nGood day.\n\nPlease refer to the attached herewith the Statement of Account for your reference.\n\nPlease be informed that your account is long overdue.\n\nKindly advise the payment of {outstanding} by {deadline}.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.${SIG}`,
  },
  "pay.2nd": {
    subject: "2nd REMINDER — Payment overdue for {project_name} ({days_over} days)",
    body: `Dear {contact},\n\nGood day.\n\nPlease refer to the attached herewith the Statement of Account for your reference.\n\nPlease be informed that your account is long overdue.\n\nKindly advise the payment of {outstanding} by {deadline}.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.${SIG}`,
  },
  "pay.final.legal": {
    subject: "FINAL REMINDER — Legal proceedings pending for {project_name} ({outstanding} outstanding)",
    body: `Dear {contact},\n\nKindly refer to the attached file for the Statement of Account as at {as_at}.\n\nPlease be informed that your account is long OVERDUE.\n\nWe will expect the full settlement of all outstanding payment {outstanding} by {deadline}.\n\nWithout prejudice to our rights, if the said payment for the amount of {outstanding} is not received in full by {deadline}, we will commence legal proceedings to recover the debt without further notice to you and this email may be tendered in court as evidence of your failure to pay.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.${SIG}`,
  },
  "pay.final.termination": {
    subject: "FINAL REMINDER — Work suspension pending for {project_name} ({outstanding} outstanding)",
    body: `Dear {contact},\n\nPlease refer to the attached herewith the Statement of Account for your reference.\n\nPlease be informed that your account is long OVERDUE.\n\nWe will expect the full settlement of all outstanding payment {outstanding} by {deadline}.\n\nWithout prejudice to our rights, if the said payment for the amount of {outstanding} is not received in full by {deadline}, we will be unable to mobilize our manpower to provide further services. Also, we will not be responsible for all the charges due to the outstanding work.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.${SIG}`,
  },
};

/** Effective template: the stored override when present, else the default. */
export function resolveTemplate(key: string, overrides: Record<string, ChaseTemplate> | null | undefined): ChaseTemplate | null {
  return overrides?.[key] ?? DEFAULT_TEMPLATES[key] ?? null;
}

/** Replace every {placeholder}; unknown placeholders are left as typed so a typo is visible. */
export function renderTemplate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{([a-z_]+)\}/g, (m, k: string) => {
    const v = vars[k];
    return v == null ? m : String(v);
  });
}

export function renderChaseTemplate(
  key: string,
  overrides: Record<string, ChaseTemplate> | null | undefined,
  vars: Record<string, string | number | null | undefined>,
): ChaseTemplate | null {
  const t = resolveTemplate(key, overrides);
  if (!t) return null;
  return { subject: renderTemplate(t.subject, vars), body: renderTemplate(t.body, vars) };
}

/** Placeholders used in a template that are not in the known list (for the editor's warning). */
export function unknownPlaceholders(text: string): string[] {
  const known = new Set(PLACEHOLDERS.map((p) => p.name));
  const out = new Set<string>();
  for (const m of text.matchAll(/\{[a-z_]+\}/g)) if (!known.has(m[0])) out.add(m[0]);
  return [...out];
}
