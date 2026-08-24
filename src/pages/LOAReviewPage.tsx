import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ParsedLineItem {
  sn: number | string;
  description: string;
  unit: string;
  qty: number | string;
  rate: number | string;
  amount: number | string;
}

interface ParsedLOA {
  projectCode?: string;
  name?: string;
  clientName?: string;
  siteAddress?: string;
  scope?: string;
  coatingSystem?: string;
  contractValue?: number | string;
  quotationRef?: string;
  salesManager?: string;
  lineItems?: ParsedLineItem[];
}

interface CommitResult {
  ok: boolean;
  project_id?: string;
  project_code?: string;
  action?: "created_new" | "matched_existing";
  error?: string;
}

interface DuplicateInfo {
  project_code: string;
  name: string | null;
  client_name: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SALES_MANAGERS = ["JENSEN", "WAN FERN", "DARYL", "JAMES", "ALEX"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toNumber(v: string): number | null {
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatSGD(v: string): string {
  const n = toNumber(v);
  if (n === null) return "";
  return n.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LOAReviewPage() {
  // Form state
  const [projectCode, setProjectCode] = useState("");
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [scope, setScope] = useState("");
  const [coatingSystem, setCoatingSystem] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [quotationRef, setQuotationRef] = useState("");
  const [salesManager, setSalesManager] = useState("");

  // Line items (read-only reference)
  const [lineItems, setLineItems] = useState<ParsedLineItem[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Duplicate check
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-fill from parsed JSON (query param or window prop)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("parsed");
      if (!raw) return;
      const parsed: ParsedLOA = JSON.parse(decodeURIComponent(raw));
      if (parsed.projectCode) setProjectCode(parsed.projectCode);
      if (parsed.name) setName(parsed.name);
      if (parsed.clientName) setClientName(parsed.clientName);
      if (parsed.siteAddress) setSiteAddress(parsed.siteAddress);
      if (parsed.scope) setScope(parsed.scope);
      if (parsed.coatingSystem) setCoatingSystem(parsed.coatingSystem);
      if (parsed.contractValue != null)
        setContractValue(String(parsed.contractValue));
      if (parsed.quotationRef) setQuotationRef(parsed.quotationRef);
      if (parsed.salesManager) setSalesManager(parsed.salesManager);
      if (parsed.lineItems?.length) setLineItems(parsed.lineItems);
    } catch {
      // ignore parse errors — manual entry fallback
    }
  }, []);

  // Debounced duplicate check on project code
  const checkDuplicate = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setDuplicate(null);
      setCheckingDup(false);
      return;
    }
    setCheckingDup(true);
    try {
      const { data } = await supabase
        .from("projects")
        .select("project_code, name, client_name")
        .eq("project_code", trimmed)
        .maybeSingle();
      setDuplicate(data ?? null);
    } catch {
      setDuplicate(null);
    } finally {
      setCheckingDup(false);
    }
  }, []);

  useEffect(() => {
    if (dupTimer.current) clearTimeout(dupTimer.current);
    dupTimer.current = setTimeout(() => checkDuplicate(projectCode), 400);
    return () => {
      if (dupTimer.current) clearTimeout(dupTimer.current);
    };
  }, [projectCode, checkDuplicate]);

  // Submit
  const handleCommit = async () => {
    const code = projectCode.trim();
    if (!code) return;

    setSubmitting(true);
    setSubmitError(null);
    setResult(null);

    try {
      const val = toNumber(contractValue);
      const { data, error } = await supabase.rpc("loa_intake", {
        p_project_code: code,
        p_name: name.trim() || null,
        p_client_name: clientName.trim() || null,
        p_site_address: siteAddress.trim() || null,
        p_scope: scope.trim() || null,
        p_coating_system: coatingSystem.trim() || null,
        p_contract_value: val,
        p_quotation_ref: quotationRef.trim() || null,
        p_sales_manager: salesManager || null,
      });

      if (error) {
        setSubmitError(error.message);
      } else {
        setResult(data as CommitResult);
      }
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "Unexpected error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setProjectCode("");
    setName("");
    setClientName("");
    setSiteAddress("");
    setScope("");
    setCoatingSystem("");
    setContractValue("");
    setQuotationRef("");
    setSalesManager("");
    setLineItems([]);
    setDuplicate(null);
    setResult(null);
    setSubmitError(null);
  };

  const isClientSuspicious =
    clientName.trim().toLowerCase() === "conplus" ||
    clientName.trim().toLowerCase().startsWith("conplus ");

  // ── Success state ──
  if (result?.ok) {
    const isNew = result.action === "created_new";
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            LOA Review
          </h1>
          <p className="text-sm text-muted-foreground">
            Letter of Award intake
          </p>
        </div>

        <div className="mx-auto max-w-lg rounded-lg border border-success/30 bg-success/5 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-success" />
          <h2 className="text-lg font-semibold text-foreground">
            {isNew
              ? `Created new project ${result.project_code}`
              : `Matched existing project ${result.project_code}`}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isNew
              ? "All fields saved to the new project record."
              : "Missing fields have been filled in on the existing record. No data was overwritten."}
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <a
              href={`/projects/${result.project_id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
            >
              View project <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={resetForm}
              className="rounded-md border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Enter another LOA
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form state ──
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            LOA Review
          </h1>
          <p className="text-sm text-muted-foreground">
            Review extracted fields, assign a project code, and commit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Intake
          </span>
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicate && !checkingDup && (
        <div
          className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 px-4 py-3"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Project code{" "}
              <span className="font-semibold">{duplicate.project_code}</span>{" "}
              already exists
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {duplicate.name || "Unnamed"}{" "}
              {duplicate.client_name
                ? `/ ${duplicate.client_name}`
                : ""}
              . Committing will fill in any blank fields on that project, not
              create a new one.
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Project code — full width */}
        <div className="md:col-span-2">
          <label
            htmlFor="loa-code"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Project code <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <input
              id="loa-code"
              type="text"
              className={cn(
                "w-full rounded-md border bg-background py-2 pl-3 pr-10 text-sm font-medium tracking-wide uppercase",
                "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
                "transition-colors",
                duplicate
                  ? "border-warning/60"
                  : "border-border"
              )}
              placeholder="e.g. E26001"
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
            />
            {checkingDup && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            You assign this code. It will be checked for duplicates
            automatically.
          </p>
        </div>

        {/* Project / site name */}
        <FieldGroup label="Project / site name" htmlFor="loa-name">
          <input
            id="loa-name"
            type="text"
            className="w-full rounded-md border border-border bg-background py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            placeholder="Site or project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FieldGroup>

        {/* Client (main contractor) — with caveat */}
        <div>
          <label
            htmlFor="loa-client"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Client (main contractor)
          </label>
          <input
            id="loa-client"
            type="text"
            className={cn(
              "w-full rounded-md border bg-background py-2 px-3 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors",
              isClientSuspicious
                ? "border-destructive/60 bg-destructive/5"
                : "border-border"
            )}
            placeholder="Main contractor who issued the award"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
          {/* Persistent hint */}
          <div className="mt-1.5 flex items-start gap-1.5">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
            <p className="text-xs text-primary font-medium">
              Main contractor who issued the award (not Conplus)
            </p>
          </div>
          {/* Active warning when "Conplus" is typed */}
          {isClientSuspicious && (
            <p className="mt-1 text-xs font-medium text-destructive">
              This looks like it says "Conplus" — Conplus is the
              sub-contractor. Enter the main contractor from the LOA
              letterhead.
            </p>
          )}
        </div>

        {/* Site address */}
        <FieldGroup label="Site address" htmlFor="loa-address">
          <input
            id="loa-address"
            type="text"
            className="w-full rounded-md border border-border bg-background py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            placeholder="Full site address"
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
          />
        </FieldGroup>

        {/* Coating system */}
        <FieldGroup label="Coating system" htmlFor="loa-coating">
          <input
            id="loa-coating"
            type="text"
            className="w-full rounded-md border border-border bg-background py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            placeholder='e.g. "StoPox TEP Multi Top"'
            value={coatingSystem}
            onChange={(e) => setCoatingSystem(e.target.value)}
          />
        </FieldGroup>

        {/* Contract value */}
        <FieldGroup label="Contract value (SGD, excl. GST)" htmlFor="loa-value">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <input
              id="loa-value"
              type="text"
              inputMode="decimal"
              className="w-full rounded-md border border-border bg-background py-2 pl-7 pr-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              placeholder="0.00"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
              onBlur={() => {
                const fmt = formatSGD(contractValue);
                if (fmt) setContractValue(fmt);
              }}
            />
          </div>
        </FieldGroup>

        {/* Quotation / award ref */}
        <FieldGroup label="Quotation / award ref" htmlFor="loa-qref">
          <input
            id="loa-qref"
            type="text"
            className="w-full rounded-md border border-border bg-background py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            placeholder="Reference number"
            value={quotationRef}
            onChange={(e) => setQuotationRef(e.target.value)}
          />
        </FieldGroup>

        {/* Sales manager */}
        <FieldGroup label="Sales manager" htmlFor="loa-sales">
          <select
            id="loa-sales"
            className="w-full rounded-md border border-border bg-background py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors cursor-pointer"
            value={salesManager}
            onChange={(e) => setSalesManager(e.target.value)}
          >
            <option value="">— Select (optional) —</option>
            {SALES_MANAGERS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </FieldGroup>

        {/* Scope — full width, multiline */}
        <div className="md:col-span-2">
          <label
            htmlFor="loa-scope"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Scope of works
          </label>
          <textarea
            id="loa-scope"
            rows={4}
            className="w-full rounded-md border border-border bg-background py-2 px-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            placeholder="Paste or describe the scope of works from the LOA"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          />
        </div>
      </div>

      {/* ── Price schedule (read-only reference) ── */}
      {lineItems.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setScheduleOpen(!scheduleOpen)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors cursor-pointer rounded-lg"
          >
            <span>
              Price schedule{" "}
              <span className="font-normal text-muted-foreground">
                — for the salesperson's work order, not saved here
              </span>
            </span>
            {scheduleOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {scheduleOpen && (
            <div className="border-t border-border px-4 py-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-12">
                      S/N
                    </th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Description
                    </th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-16 text-right">
                      Unit
                    </th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-16 text-right">
                      Qty
                    </th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24 text-right">
                      Rate
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider w-24 text-right">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                        {li.sn}
                      </td>
                      <td className="py-2 pr-4">{li.description}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">
                        {li.unit}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {li.qty}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {li.rate}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        {li.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div
          className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/8 px-4 py-3"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Commit failed</p>
            <p className="mt-0.5 text-muted-foreground">{submitError}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border pt-5">
        <button
          type="button"
          onClick={resetForm}
          className="rounded-md border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          Clear form
        </button>

        <button
          type="button"
          onClick={handleCommit}
          disabled={!projectCode.trim() || submitting}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all cursor-pointer",
            "bg-primary text-primary-foreground hover:opacity-90",
            "focus:outline-none focus:ring-2 focus:ring-primary/40",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {submitting && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {duplicate ? "Commit (fill blanks)" : "Commit project"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Field group helper                                                 */
/* ------------------------------------------------------------------ */

function FieldGroup({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
