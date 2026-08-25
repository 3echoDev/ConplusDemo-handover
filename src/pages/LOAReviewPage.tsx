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
  ArrowLeft,
  Plus,
  Trash2,
  Clock,
  Building2,
  DollarSign,
  FileWarning,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LineItem {
  sn: number | string;
  description: string;
  unit: string;
  qty: number | string;
  rate: number | string;
  amount: number | string;
}

interface LOADraft {
  id: string;
  status: string;
  name: string | null;
  client_name: string | null;
  site_address: string | null;
  scope: string | null;
  coating_system: string | null;
  contract_value: number | null;
  quotation_ref: string | null;
  sales_manager: string | null;
  contact_person: string | null;
  contact_number: string | null;
  start_date: string | null;
  end_date: string | null;
  doc_type: string | null;
  payment_terms_days: number | null;
  line_items: LineItem[] | null;
  suggested_code: string | null;
  source: string | null;
  raw_notes: string | null;
  created_at: string;
}

interface CommitResult {
  ok: boolean;
  project_id?: string;
  project_code?: string;
  action?: "created_new" | "matched_existing";
  error?: string;
  _woNote?: string;
}

interface DuplicateInfo {
  project_code: string;
  name: string | null;
  client_name: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CODE_PREFIXES = ["E", "F", "M"] as const;
const DOC_TYPE_LABELS: Record<string, string> = {
  LOA: "LOA",
  VO: "VO",
  PO: "PO",
  WO: "WO",
  signed_quotation: "Signed Quotation",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toNumber(v: string): number | null {
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatSGD(v: number | string | null): string {
  const n = typeof v === "number" ? v : toNumber(String(v ?? ""));
  if (n === null) return "";
  return n.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Shared input class                                                 */
/* ------------------------------------------------------------------ */

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-background py-2.5 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

/* ================================================================== */
/*  Main component                                                     */
/* ================================================================== */

export default function LOAReviewPage() {
  const [view, setView] = useState<"queue" | "review" | "success">("queue");
  const [drafts, setDrafts] = useState<LOADraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDraft, setActiveDraft] = useState<LOADraft | null>(null);

  // Success result (after commit)
  const [result, setResult] = useState<CommitResult | null>(null);

  // ── Load pending drafts ──
  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("loa_drafts")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setDrafts(data ?? []);
    } catch {
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // ── Open a draft for review ──
  const openDraft = (draft: LOADraft) => {
    setActiveDraft(draft);
    setResult(null);
    setView("review");
  };

  // ── Start blank manual entry ──
  const openBlank = () => {
    setActiveDraft(null);
    setResult(null);
    setView("review");
  };

  // ── Return to queue ──
  const backToQueue = () => {
    setView("queue");
    setActiveDraft(null);
    setResult(null);
    loadDrafts();
  };

  // ── On successful commit ──
  const onCommitted = (res: CommitResult) => {
    setResult(res);
    setView("success");
  };

  // ── Discard a draft ──
  const discardDraft = async (draftId: string) => {
    await supabase
      .from("loa_drafts")
      .update({ status: "discarded" })
      .eq("id", draftId);
    loadDrafts();
    if (activeDraft?.id === draftId) {
      backToQueue();
    }
  };

  /* ────────────────────────────────────────────────────────────────── */
  /*  Success view                                                      */
  /* ────────────────────────────────────────────────────────────────── */
  if (view === "success" && result?.ok) {
    const isNew = result.action === "created_new";
    return (
      <PageShell>
        <div className="mx-auto max-w-[680px]">
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {isNew
                ? `Created project ${result.project_code}`
                : `Updated project ${result.project_code}`}
              {result._woNote && result._woNote}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              {isNew
                ? "All fields saved. The project now appears in Claims and Portfolio."
                : "Missing fields filled in on the existing record. No data was overwritten."}
            </p>

            <div className="mt-8 flex items-center justify-center gap-3">
              <a
                href={`/projects/${result.project_id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
              >
                View project <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                onClick={backToQueue}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors cursor-pointer"
              >
                Back to queue
              </button>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  /* ────────────────────────────────────────────────────────────────── */
  /*  Review (form) view                                                */
  /* ────────────────────────────────────────────────────────────────── */
  if (view === "review") {
    return (
      <PageShell>
        <div className="mx-auto max-w-[680px]">
          {/* Back link */}
          <button
            onClick={backToQueue}
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
          </button>

          <ReviewForm
            draft={activeDraft}
            onCommitted={onCommitted}
            onDiscard={activeDraft ? () => discardDraft(activeDraft.id) : undefined}
          />
        </div>
      </PageShell>
    );
  }

  /* ────────────────────────────────────────────────────────────────── */
  /*  Queue (list) view — default                                       */
  /* ────────────────────────────────────────────────────────────────── */
  return (
    <PageShell>
      <div className="mx-auto max-w-2xl">
        {/* Action bar */}
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading..."
              : drafts.length === 0
                ? "No LOAs waiting"
                : `${drafts.length} pending`}
          </p>
          <button
            onClick={openBlank}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Manual entry
          </button>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-5 shadow-sm animate-pulse"
              >
                <div className="h-4 w-48 rounded bg-muted mb-3" />
                <div className="h-3 w-32 rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && drafts.length === 0 && (
          <div className="rounded-xl border border-border bg-card px-8 py-16 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FileCheck2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-heading text-base font-semibold text-foreground">
              No LOAs waiting for review
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xs mx-auto">
              Parsed LOAs will appear here automatically. You can also create a
              project manually.
            </p>
            <button
              onClick={openBlank}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" /> New manual entry
            </button>
          </div>
        )}

        {/* Draft cards */}
        {!loading && drafts.length > 0 && (
          <div className="space-y-3">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="group rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/30 hover:shadow-md transition-all cursor-pointer"
                onClick={() => openDraft(d)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && openDraft(d)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {/* Project name + doc-type pill */}
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading text-sm font-semibold text-foreground truncate">
                        {d.name || "Unnamed project"}
                      </h3>
                      {d.doc_type && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                          {DOC_TYPE_LABELS[d.doc_type] || d.doc_type}
                        </span>
                      )}
                    </div>

                    {/* Client + value row */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {d.client_name ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {d.client_name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warning font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          Client needs confirming
                        </span>
                      )}

                      {d.contract_value != null && (
                        <span className="inline-flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${formatSGD(d.contract_value)}
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(d.created_at)}
                      </span>
                    </div>

                    {/* Raw notes flag */}
                    {d.raw_notes && (
                      <div className="mt-2 flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5">
                        <FileWarning className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                        <p className="text-xs text-foreground leading-snug">
                          {d.raw_notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Review button */}
                  <span className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors">
                    Review
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

/* ================================================================== */
/*  Page shell — header + off-white bg                                 */
/* ================================================================== */

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          LOA Review
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Review parsed Letters of Award and commit to projects
        </p>
      </div>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Review form (centered card)                                        */
/* ================================================================== */

function ReviewForm({
  draft,
  onCommitted,
  onDiscard,
}: {
  draft: LOADraft | null;
  onCommitted: (r: CommitResult) => void;
  onDiscard?: () => void;
}) {
  // Form state — pre-fill from draft
  const [projectCode, setProjectCode] = useState(draft?.suggested_code ?? "");
  const [name, setName] = useState(draft?.name ?? "");
  const [clientName, setClientName] = useState(draft?.client_name ?? "");
  const [siteAddress, setSiteAddress] = useState(draft?.site_address ?? "");
  const [scope, setScope] = useState(draft?.scope ?? "");
  const [coatingSystem, setCoatingSystem] = useState(draft?.coating_system ?? "");
  const [contractValue, setContractValue] = useState(
    draft?.contract_value != null ? formatSGD(draft.contract_value) : ""
  );
  const [quotationRef, setQuotationRef] = useState(draft?.quotation_ref ?? "");
  const [salesManager, setSalesManager] = useState(draft?.sales_manager ?? "");
  const [contactPerson, setContactPerson] = useState(draft?.contact_person ?? "");
  const [contactNumber, setContactNumber] = useState(draft?.contact_number ?? "");
  const [startDate, setStartDate] = useState(draft?.start_date ?? "");
  const [endDate, setEndDate] = useState(draft?.end_date ?? "");

  const [paymentTerms, setPaymentTerms] = useState(
    draft?.payment_terms_days != null ? String(draft.payment_terms_days) : "35"
  );
  const [draftWO, setDraftWO] = useState(true);

  const lineItems: LineItem[] = draft?.line_items ?? [];
  const hasLineItems = lineItems.length > 0;
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Salespeople from DB
  const [salespeople, setSalespeople] = useState<string[]>([]);
  useEffect(() => {
    supabase
      .from("salespeople")
      .select("canonical_name")
      .eq("active", true)
      .order("canonical_name")
      .then(({ data }) => {
        if (data) setSalespeople(data.map((s: { canonical_name: string }) => s.canonical_name));
      });
  }, []);

  // Prefix code suggestion
  const [selectedPrefix, setSelectedPrefix] = useState<string>("");
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null);
  const [suggestingCode, setSuggestingCode] = useState(false);

  const handlePrefixPick = async (prefix: string) => {
    setSelectedPrefix(prefix);
    setSuggestingCode(true);
    try {
      const { data } = await supabase.rpc("suggest_next_code", { p_prefix: prefix });
      if (data?.suggested_code) {
        setSuggestedCode(data.suggested_code);
        setProjectCode(data.suggested_code);
      }
    } catch { /* ignore */ }
    finally { setSuggestingCode(false); }
  };

  // Duplicate check
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debounced duplicate check
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

  // Commit
  const handleCommit = async () => {
    const code = projectCode.trim();
    if (!code) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const val = toNumber(contractValue);

      if (draft) {
        // Confirm via RPC (marks draft confirmed + creates/updates project)
        const { data, error } = await supabase.rpc("confirm_loa_draft", {
          p_draft_id: draft.id,
          p_project_code: code,
          p_name: name.trim() || null,
          p_client_name: clientName.trim() || null,
          p_site_address: siteAddress.trim() || null,
          p_scope: scope.trim() || null,
          p_coating_system: coatingSystem.trim() || null,
          p_contract_value: val,
          p_quotation_ref: quotationRef.trim() || null,
          p_sales_manager: salesManager || null,
          p_contact_person: contactPerson.trim() || null,
          p_contact_number: contactNumber.trim() || null,
          p_start_date: startDate || null,
          p_end_date: endDate || null,
        });
        if (error) throw new Error(error.message);
        const res = data as CommitResult;

        // Payment terms — update project if user set/changed it
        const terms = toNumber(paymentTerms);
        if (res.project_id && terms != null && terms !== 35) {
          await supabase.from("projects").update({ payment_terms_days: terms }).eq("id", res.project_id);
        }

        // WO skeleton
        let woNote = "";
        if (draftWO && hasLineItems && draft) {
          try {
            const { data: woData } = await supabase.rpc("create_wo_skeleton", { p_draft_id: draft.id });
            if (woData?.ok) woNote = ` · Works Order draft started (${woData.areas ?? 0} areas)`;
          } catch { /* non-blocking */ }
        }

        onCommitted({ ...res, _woNote: woNote } as CommitResult & { _woNote?: string });
      } else {
        // Manual entry — insert a draft then confirm it in one go
        const { data: newDraft, error: insertErr } = await supabase
          .from("loa_drafts")
          .insert({
            status: "pending",
            source: "manual",
            name: name.trim() || null,
            client_name: clientName.trim() || null,
            site_address: siteAddress.trim() || null,
            scope: scope.trim() || null,
            coating_system: coatingSystem.trim() || null,
            contract_value: val,
            quotation_ref: quotationRef.trim() || null,
            sales_manager: salesManager || null,
            contact_person: contactPerson.trim() || null,
            contact_number: contactNumber.trim() || null,
            start_date: startDate || null,
            end_date: endDate || null,
            suggested_code: code,
          })
          .select("id")
          .single();
        if (insertErr) throw new Error(insertErr.message);

        const { data, error } = await supabase.rpc("confirm_loa_draft", {
          p_draft_id: newDraft.id,
          p_project_code: code,
          p_name: name.trim() || null,
          p_client_name: clientName.trim() || null,
          p_site_address: siteAddress.trim() || null,
          p_scope: scope.trim() || null,
          p_coating_system: coatingSystem.trim() || null,
          p_contract_value: val,
          p_quotation_ref: quotationRef.trim() || null,
          p_sales_manager: salesManager || null,
          p_contact_person: contactPerson.trim() || null,
          p_contact_number: contactNumber.trim() || null,
          p_start_date: startDate || null,
          p_end_date: endDate || null,
        });
        if (error) throw new Error(error.message);

        // Payment terms for manual entry
        const mRes = data as CommitResult;
        const mTerms = toNumber(paymentTerms);
        if (mRes.project_id && mTerms != null && mTerms !== 35) {
          await supabase.from("projects").update({ payment_terms_days: mTerms }).eq("id", mRes.project_id);
        }

        onCommitted(mRes);
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  };

  const isClientSuspicious =
    clientName.trim().toLowerCase() === "conplus" ||
    clientName.trim().toLowerCase().startsWith("conplus ");

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {/* Card header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {draft
              ? `Reviewing${draft.doc_type ? `: ${DOC_TYPE_LABELS[draft.doc_type] || draft.doc_type}` : ""}`
              : "New project (manual)"}
          </h2>
          {draft?.doc_type && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary uppercase tracking-wide">
              {DOC_TYPE_LABELS[draft.doc_type] || draft.doc_type}
            </span>
          )}
        </div>
        {draft?.name && (
          <p className="mt-0.5 text-sm text-foreground">{draft.name}</p>
        )}
        {draft?.source && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Source: {draft.source} · received {timeAgo(draft.created_at)}
          </p>
        )}
      </div>

      <div className="p-6 space-y-7">
        {/* Draft raw_notes warning */}
        {draft?.raw_notes && (
          <div
            className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3"
            role="alert"
          >
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm text-foreground leading-snug">
              {draft.raw_notes}
            </p>
          </div>
        )}

        {/* Duplicate warning */}
        {duplicate && !checkingDup && (
          <div
            className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                Code{" "}
                <span className="font-semibold">{duplicate.project_code}</span>{" "}
                already exists
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {duplicate.name || "Unnamed"}{" "}
                {duplicate.client_name ? `/ ${duplicate.client_name}` : ""}.
                Committing will fill blank fields only.
              </p>
            </div>
          </div>
        )}

        {/* ── Section: Project ── */}
        <FormSection title="Project">
          <div>
            <label
              htmlFor="loa-code"
              className="mb-1.5 block text-xs font-semibold text-foreground uppercase tracking-wide"
            >
              Project code <span className="text-destructive">*</span>
            </label>
            {/* Prefix selector */}
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Prefix:</span>
              {CODE_PREFIXES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePrefixPick(p)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
                    selectedPrefix === p
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-secondary"
                  )}
                >
                  {p}
                </button>
              ))}
              {suggestingCode && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
            </div>
            <div className="relative">
              <input
                id="loa-code"
                type="text"
                className={cn(
                  INPUT_CLS,
                  "font-semibold tracking-wider uppercase",
                  duplicate && "border-warning"
                )}
                placeholder="e.g. E26001"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
              />
              {checkingDup && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {suggestedCode && projectCode === suggestedCode ? (
              <p className="mt-1 text-[11px] text-primary font-medium">
                Suggested next number — edit if needed
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                You assign this code. Duplicates are checked automatically.
              </p>
            )}
          </div>

          <Field label="Project / site name" htmlFor="loa-name">
            <input
              id="loa-name"
              type="text"
              className={INPUT_CLS}
              placeholder="Site or project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="Site address" htmlFor="loa-address">
            <input
              id="loa-address"
              type="text"
              className={INPUT_CLS}
              placeholder="Full site address"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
            />
          </Field>
        </FormSection>

        {/* ── Section: Commercial ── */}
        <FormSection title="Commercial">
          {/* Client with caveat */}
          <div>
            <label
              htmlFor="loa-client"
              className="mb-1.5 block text-xs font-semibold text-foreground uppercase tracking-wide"
            >
              Client (main contractor)
            </label>
            <input
              id="loa-client"
              type="text"
              className={cn(
                INPUT_CLS,
                isClientSuspicious && "border-destructive bg-destructive/5"
              )}
              placeholder="Main contractor who issued the award"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <div className="mt-1.5 flex items-start gap-1.5">
              <Info className="mt-px h-3 w-3 shrink-0 text-primary" />
              <p className="text-[11px] text-primary font-medium leading-snug">
                The company on the LOA letterhead — not Conplus
              </p>
            </div>
            {isClientSuspicious && (
              <p className="mt-1 text-xs font-medium text-destructive">
                "Conplus" is the sub-contractor. Enter the main contractor.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Contract value (SGD, excl. GST)"
              htmlFor="loa-value"
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  $
                </span>
                <input
                  id="loa-value"
                  type="text"
                  inputMode="decimal"
                  className={cn(INPUT_CLS, "pl-7 tabular-nums")}
                  placeholder="0.00"
                  value={contractValue}
                  onChange={(e) => setContractValue(e.target.value)}
                  onBlur={() => {
                    const fmt = formatSGD(contractValue);
                    if (fmt) setContractValue(fmt);
                  }}
                />
              </div>
            </Field>

            <Field label="Quotation / award ref" htmlFor="loa-qref">
              <input
                id="loa-qref"
                type="text"
                className={INPUT_CLS}
                placeholder="Reference number"
                value={quotationRef}
                onChange={(e) => setQuotationRef(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sales manager" htmlFor="loa-sales">
              <select
                id="loa-sales"
                className={cn(INPUT_CLS, "cursor-pointer")}
                value={salesManager}
                onChange={(e) => setSalesManager(e.target.value)}
              >
                <option value="">— Select (optional) —</option>
                {salespeople.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Payment terms (days after invoice)" htmlFor="loa-terms">
              <input
                id="loa-terms"
                type="number"
                min={0}
                className={cn(INPUT_CLS, "tabular-nums")}
                placeholder="35"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Default 35 — from the award document if stated
              </p>
            </Field>
          </div>
        </FormSection>

        {/* ── Section: Contact & Schedule ── */}
        <FormSection title="Contact & Schedule">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact person" htmlFor="loa-contact-person">
              <input
                id="loa-contact-person"
                type="text"
                className={INPUT_CLS}
                placeholder="e.g. Ms Khine"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </Field>
            <Field label="Contact number" htmlFor="loa-contact-number">
              <input
                id="loa-contact-number"
                type="text"
                className={INPUT_CLS}
                placeholder="e.g. 9105 9549"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="loa-start-date">
              <input
                id="loa-start-date"
                type="date"
                className={cn(INPUT_CLS, "cursor-pointer")}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              {!startDate && (
                <p className="mt-1 text-[11px] text-muted-foreground">Leave empty if TBA</p>
              )}
            </Field>
            <Field label="End date" htmlFor="loa-end-date">
              <input
                id="loa-end-date"
                type="date"
                className={cn(INPUT_CLS, "cursor-pointer")}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              {!endDate && (
                <p className="mt-1 text-[11px] text-muted-foreground">Leave empty if TBA</p>
              )}
            </Field>
          </div>
        </FormSection>

        {/* ── Section: Works ── */}
        <FormSection title="Works">
          <Field label="Scope of works" htmlFor="loa-scope">
            <textarea
              id="loa-scope"
              rows={4}
              className={cn(INPUT_CLS, "leading-relaxed resize-y")}
              placeholder="Paste or describe the scope from the LOA"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            />
          </Field>

          <Field label="Coating system" htmlFor="loa-coating">
            <input
              id="loa-coating"
              type="text"
              className={INPUT_CLS}
              placeholder='e.g. "StoPox TEP Multi Top"'
              value={coatingSystem}
              onChange={(e) => setCoatingSystem(e.target.value)}
            />
          </Field>
        </FormSection>

        {/* ── Price schedule (read-only) ── */}
        {lineItems.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/20">
            <button
              type="button"
              onClick={() => setScheduleOpen(!scheduleOpen)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors cursor-pointer rounded-lg"
            >
              <span>
                Price schedule{" "}
                <span className="font-normal text-muted-foreground">
                  — reference only, not saved
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
                      {["S/N", "Description", "Unit", "Qty", "Rate", "Amount"].map(
                        (h, i) => (
                          <th
                            key={h}
                            className={cn(
                              "pb-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider",
                              i > 1 && "text-right",
                              i === 0 && "w-10",
                              i === 1 && "min-w-[120px]"
                            )}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/40 last:border-0"
                      >
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                          {li.sn}
                        </td>
                        <td className="py-2 pr-3">{li.description}</td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {li.unit}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {li.qty}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
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
            className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Commit failed</p>
              <p className="mt-0.5 text-muted-foreground">{submitError}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Card footer: actions ── */}
      <div className="border-t border-border px-6 py-4 space-y-3">
        {/* WO skeleton toggle — only when draft has line_items */}
        {hasLineItems && draft && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draftWO}
              onChange={(e) => setDraftWO(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
            />
            <span className="text-sm text-foreground">
              Also draft the Works Order
              <span className="text-muted-foreground"> (header + areas — materials left for sales)</span>
            </span>
          </label>
        )}

        <div className="flex items-center justify-between">
        <div>
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleCommit}
          disabled={!projectCode.trim() || submitting}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold shadow-sm transition-all cursor-pointer",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          )}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {duplicate ? "Commit (fill blanks)" : "Commit project"}
        </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Small helpers                                                      */
/* ================================================================== */

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
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
        className="mb-1.5 block text-xs font-semibold text-foreground uppercase tracking-wide"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
