import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

/*
  ConPlus — Claims Pivot & Payment Chase (v3 — To Claim + portfolio strip)
  -------------------------------------------------------------------------
  Reads `claims` joined to `projects` for the pivot grid + chase table.
  Reads `project_claim_summary` (Supabase view) for billable_contract and
  to_claim — these are live-computed, never stored.

  Uses the app's shared Supabase client. Do NOT add createClient here.
*/

// ---- Chase anchor -----------------------------------------------------------
// The T+30 age is computed from this field. When certified_date or paid_date
// become populated in the data, change this to the correct anchor field.
const CHASE_ANCHOR = "claim_date";

// ---- helpers ---------------------------------------------------------------
const fmt = (n) =>
  n == null ? "—" : n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });
const fmtFull = (n) =>
  n == null ? "—" : n.toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });

const monthKey = (d) => (d ? d.slice(0, 7) : null);
const monthLabel = (key) => {
  if (!key) return "—";
  const [y, m] = key.split("-");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1];
  return `${mon}'${y.slice(2)}`;
};

const daysSince = (dateStr) => {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  if (isNaN(then)) return null;
  return Math.floor((new Date() - then) / (1000 * 60 * 60 * 24));
};

// ---- messy-data cleaners (keep — real data has \n and *notes*) -------------
function cleanName(n) {
  if (!n) return "";
  return n.split("\n")[0].replace(/\*.*?\*/g, "").trim();
}
function cleanClient(c) {
  if (!c) return "";
  return c.split("\n")[0].replace(/\*.*?\*/g, "").trim();
}
function compact(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1000) return sign + (abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1) + "k";
  return sign + Math.round(abs).toString();
}
function cellTitle(c) {
  return `Claim #${c.claim_no ?? "—"} · ${c.status}\nClaimed ${fmtFull(c.amount)}\nCertified ${
    c.certified == null ? "pending" : fmtFull(c.certified)
  }`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function ClaimsPivot() {
  const [rows, setRows] = useState([]);
  const [summaryMap, setSummaryMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [view, setView] = useState("pivot");
  const [managerFilter, setManagerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [claimsRes, summaryRes] = await Promise.all([
          supabase
            .from("claims")
            .select(
              "claim_no, claim_date, amount, certified_amount, status, contact_person, contact_number, " +
                "projects!inner(id, project_code, name, client_name, contract_value, total_contract_value, vo_value, sales_manager, status, work_type_code)"
            )
            .order("claim_date", { ascending: true }),
          supabase
            .from("project_claim_summary")
            .select("project_code, billable_contract, total_claimed, total_certified, to_claim"),
        ]);
        if (claimsRes.error) throw claimsRes.error;
        if (summaryRes.error) throw summaryRes.error;

        const flat = (claimsRes.data || []).map((c) => ({
          claim_no: c.claim_no,
          claim_date: c.claim_date,
          amount: c.amount == null ? null : Number(c.amount),
          certified: c.certified_amount == null ? null : Number(c.certified_amount),
          status: c.status,
          contact: c.projects?.contact_person || c.contact_person,
          phone: c.projects?.contact_number || c.contact_number,
          code: c.projects?.project_code,
          projectId: c.projects?.id,
          name: c.projects?.name,
          client: c.projects?.client_name,
          contract: c.projects?.total_contract_value || c.projects?.contract_value,
          voValue: c.projects?.vo_value == null ? null : Number(c.projects.vo_value),
          contractBase: c.projects?.contract_value == null ? null : Number(c.projects.contract_value),
          manager: c.projects?.sales_manager,
        }));
        setRows(flat);

        const sMap = new Map();
        for (const s of summaryRes.data || []) {
          sMap.set(s.project_code, {
            billable: s.billable_contract == null ? null : Number(s.billable_contract),
            totalClaimed: s.total_claimed == null ? null : Number(s.total_claimed),
            totalCertified: s.total_certified == null ? null : Number(s.total_certified),
            toClaim: s.to_claim == null ? null : Number(s.to_claim),
          });
        }
        setSummaryMap(sMap);
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const months = useMemo(() => {
    const set = new Set(rows.map((r) => monthKey(r.claim_date)).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const managers = useMemo(() => {
    const set = new Set(rows.map((r) => r.manager).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const projects = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.code)) {
        map.set(r.code, {
          code: r.code, projectId: r.projectId, name: r.name, client: r.client,
          contract: r.contract, voValue: r.voValue, contractBase: r.contractBase,
          manager: r.manager,
          cells: {}, claims: [], totalClaimed: 0, totalCertified: 0,
        });
      }
      const p = map.get(r.code);
      const mk = monthKey(r.claim_date);
      if (mk) p.cells[mk] = r;
      p.claims.push(r);
      p.totalClaimed += r.amount || 0;
      p.totalCertified += r.certified || 0;
    }
    let arr = [...map.values()];
    // Enrich with summary view data
    for (const p of arr) {
      const s = summaryMap.get(p.code);
      if (s) {
        p.billable = s.billable;
        p.toClaim = s.toClaim;
      } else {
        p.billable = null;
        p.toClaim = null;
      }
    }
    if (managerFilter !== "all") arr = arr.filter((p) => p.manager === managerFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (p) =>
          p.code?.toLowerCase().includes(q) ||
          p.name?.toLowerCase().includes(q) ||
          p.client?.toLowerCase().includes(q)
      );
    }
    if (statusFilter === "outstanding") {
      arr = arr.filter((p) => p.totalCertified - 0 > 0 && p.claims.some((c) => c.status === "submitted"));
    }
    arr.sort((a, b) => {
      const la = a.claims[a.claims.length - 1]?.claim_date || "";
      const lb = b.claims[b.claims.length - 1]?.claim_date || "";
      return lb.localeCompare(la);
    });
    return arr;
  }, [rows, summaryMap, managerFilter, statusFilter, search]);

  const chase = useMemo(() => {
    const items = [];
    for (const r of rows) {
      const age = daysSince(r[CHASE_ANCHOR]);
      if (r.status === "certified" && r.certified > 0 && age >= 30) {
        items.push({ ...r, kind: "payment_due", age });
      } else if (r.status === "submitted" && age >= 30) {
        items.push({ ...r, kind: "awaiting_cert", age });
      }
    }
    items.sort((a, b) => b.age - a.age);
    return items;
  }, [rows]);

  // Portfolio totals (filtered)
  const portfolio = useMemo(() => {
    let billable = 0, claimed = 0, certified = 0, toClaim = 0;
    let hasBillable = false, hasToClaim = false;
    for (const p of projects) {
      if (p.billable != null) { billable += p.billable; hasBillable = true; }
      claimed += p.totalClaimed;
      certified += p.totalCertified;
      if (p.toClaim != null) { toClaim += p.toClaim; hasToClaim = true; }
    }
    return {
      billable: hasBillable ? billable : null,
      claimed,
      certified,
      toClaim: hasToClaim ? toClaim : null,
    };
  }, [projects]);

  if (loading) return <Shell><div className="cp-loading">Loading claims&#8230;</div></Shell>;
  if (err)
    return (
      <Shell>
        <div className="cp-error">
          <strong>Couldn't load claims.</strong> {err}
          <div className="cp-error-hint">Check the Supabase connection and that the anon key has read access to claims.</div>
        </div>
      </Shell>
    );

  const totalOutstanding = chase.filter((c) => c.kind === "payment_due").reduce((s, c) => s + c.certified, 0);
  const awaitingCount = chase.filter((c) => c.kind === "awaiting_cert").length;

  return (
    <Shell>
      {/* ── Header ── */}
      <header className="cp-header">
        <div className="cp-header-left">
          <a href="/" className="cp-back" title="Back to Live Operations">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </a>
          <span className="cp-title">Progress Claims</span>
          <span className="cp-stats">{projects.length} projects &middot; {rows.length} claims</span>
        </div>
        <div className="cp-tabs">
          <button className={`cp-tab${view === "pivot" ? " on" : ""}`} onClick={() => setView("pivot")}>
            Claims grid
          </button>
          <button className={`cp-tab${view === "chase" ? " on" : ""}`} onClick={() => setView("chase")}>
            Payment chase
            {chase.length > 0 && <span className="cp-badge">{chase.length}</span>}
          </button>
        </div>
      </header>

      {/* ── Summary cards (chase only) ── */}
      {view === "chase" && (
        <div className="cp-summary">
          <div className="cp-stat cp-stat-warn">
            <span className="cp-stat-val">{fmt(totalOutstanding)}</span>
            <span className="cp-stat-lbl">Certified &amp; ageing (30+ days)</span>
          </div>
          <div className="cp-stat cp-stat-info">
            <span className="cp-stat-val">{awaitingCount}</span>
            <span className="cp-stat-lbl">Submitted, awaiting certification</span>
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="cp-controls">
        <input
          className="cp-search"
          placeholder="Search project, code, or client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="cp-select" value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
          <option value="all">All managers</option>
          {managers.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {view === "pivot" && (
          <select className="cp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All projects</option>
            <option value="outstanding">Has outstanding</option>
          </select>
        )}
      </div>

      {/* ── Views ── */}
      {view === "pivot" ? (
        <>
          <PortfolioStrip portfolio={portfolio} />
          <PivotGrid projects={projects} months={months} expanded={expanded} setExpanded={setExpanded} />
        </>
      ) : (
        <ChaseTable items={chase} />
      )}
    </Shell>
  );
}

// ============================================================================
// PORTFOLIO STRIP (filtered summary above grid)
// ============================================================================
function PortfolioStrip({ portfolio }) {
  return (
    <div className="cp-portfolio">
      <div className="cp-pf-item">
        <span className="cp-pf-label">Contract</span>
        <span className="cp-pf-val">{fmt(portfolio.billable)}</span>
      </div>
      <span className="cp-pf-sep">&middot;</span>
      <div className="cp-pf-item">
        <span className="cp-pf-label">Claimed</span>
        <span className="cp-pf-val">{fmt(portfolio.claimed)}</span>
      </div>
      <span className="cp-pf-sep">&middot;</span>
      <div className="cp-pf-item">
        <span className="cp-pf-label">Certified</span>
        <span className="cp-pf-val">{fmt(portfolio.certified)}</span>
      </div>
      <span className="cp-pf-sep">&middot;</span>
      <div className="cp-pf-item cp-pf-highlight">
        <span className="cp-pf-label">To claim</span>
        <span className="cp-pf-val">{fmt(portfolio.toClaim)}</span>
      </div>
    </div>
  );
}

// ============================================================================
// PIVOT GRID
// ============================================================================
function PivotGrid({ projects, months, expanded, setExpanded }) {
  if (projects.length === 0)
    return <div className="cp-empty">No projects match. Clear the filters to see everything.</div>;

  return (
    <div className="cp-grid-wrap">
      <table className="cp-grid">
        <thead>
          <tr>
            <th className="cp-th-proj">Project</th>
            <th>Contract</th>
            {months.map((m) => <th key={m} className="cp-th-month">{monthLabel(m)}</th>)}
            <th className="cp-th-total">Claimed</th>
            <th className="cp-th-total">Certified</th>
            <th className="cp-th-total">To Claim</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const isOpen = expanded === p.code;
            const outstanding = p.totalClaimed - p.totalCertified;
            return (
              <React.Fragment key={p.code}>
                <tr className={isOpen ? "cp-row-open" : ""} onClick={() => setExpanded(isOpen ? null : p.code)}>
                  <td className="cp-col-proj">
                    <span className="cp-code">{p.code}</span>
                    <span className="cp-pname">{cleanName(p.name)}</span>
                    <span className="cp-client">{cleanClient(p.client)}</span>
                  </td>
                  <td className="cp-col-contract">{fmt(Number(p.contract))}</td>
                  {months.map((m) => {
                    const c = p.cells[m];
                    if (!c) return <td key={m} className="cp-cell cp-cell-empty" />;
                    return (
                      <td key={m} className={`cp-cell cp-cell-${c.status}`} title={cellTitle(c)}>
                        <span className="cp-cell-amt">{compact(c.certified ?? c.amount)}</span>
                        <span className="cp-cell-no">#{c.claim_no ?? "—"}</span>
                      </td>
                    );
                  })}
                  <td className="cp-col-total">{fmt(p.totalClaimed)}</td>
                  <td className="cp-col-total cp-col-cert">
                    {fmt(p.totalCertified)}
                    {Math.abs(outstanding) > 1 && <span className="cp-outstanding">{compact(outstanding)}</span>}
                  </td>
                  <td className={`cp-col-total cp-col-toclaim${p.toClaim == null ? "" : p.toClaim > 10000 ? " cp-toclaim-high" : Math.abs(p.toClaim) < 1 ? " cp-toclaim-zero" : ""}`}>
                    {p.toClaim == null ? <span className="cp-muted">&mdash;</span> : fmt(p.toClaim)}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="cp-detail-row">
                    <td className="cp-col-proj" />
                    <td colSpan={months.length + 4}>
                      <ClaimDetail project={p} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// EXPANDED DETAIL
// ============================================================================
function ClaimDetail({ project }) {
  return (
    <div className="cp-detail">
      <div className="cp-detail-head">
        <span className="cp-detail-title">{project.code} &mdash; {cleanName(project.name)}</span>
        <div className="cp-detail-contact">
          {project.claims[0]?.contact && <span>{project.claims[0].contact}</span>}
          {project.claims[0]?.phone && <span className="cp-phone">{project.claims[0].phone}</span>}
        </div>
      </div>
      <table className="cp-dtable">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Date</th>
            <th className="r">Claimed</th>
            <th className="r">Certified</th>
            <th className="r">Variance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {project.claims.map((c, i) => {
            const variance = c.certified != null && c.amount != null ? c.certified - c.amount : null;
            return (
              <tr key={i}>
                <td>#{c.claim_no ?? "—"}</td>
                <td>{monthLabel(monthKey(c.claim_date))}</td>
                <td className="r">{fmtFull(c.amount)}</td>
                <td className="r">{c.certified == null ? <em className="cp-pending">pending</em> : fmtFull(c.certified)}</td>
                <td className={`r ${variance != null && variance < 0 ? "cp-neg" : ""} ${variance != null && variance > 0 ? "cp-pos" : ""}`}>
                  {variance == null ? "—" : (variance >= 0 ? "+" : "") + fmtFull(variance)}
                </td>
                <td><span className={`cp-pill cp-pill-${c.status}`}>{c.status}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Reconciliation footer */}
      <div className="cp-recon">
        <div className="cp-recon-item">
          <span className="cp-recon-label">Contract</span>
          <span className="cp-recon-val">{fmtFull(project.billable)}</span>
        </div>
        <div className="cp-recon-item">
          <span className="cp-recon-label">Claimed</span>
          <span className="cp-recon-val">{fmtFull(project.totalClaimed)}</span>
        </div>
        <div className={`cp-recon-item cp-recon-toclaim${project.toClaim != null && project.toClaim > 10000 ? " cp-recon-high" : ""}${project.toClaim != null && Math.abs(project.toClaim) < 1 ? " cp-recon-zero" : ""}`}>
          <span className="cp-recon-label">To claim</span>
          <span className="cp-recon-val">{project.toClaim == null ? "—" : fmtFull(project.toClaim)}</span>
        </div>
      </div>
      <VOSection
        projectId={project.projectId}
        voValue={project.voValue}
        contractBase={project.contractBase}
        totalContract={Number(project.contract)}
      />
    </div>
  );
}

// ============================================================================
// VO SECTION (lazy-loaded inside detail panel)
// ============================================================================
const LUMP_LABEL = "VO-LEGACY (unallocated)";

function VOSection({ projectId, voValue, contractBase, totalContract }) {
  const [vos, setVos] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("project_vos")
        .select("vo_number, quotation_ref, amount, description, legacy_code")
        .eq("project_id", projectId);
      if (!error && data && data.length > 0) setVos(data);
      setLoading(false);
    })();
  }, [projectId]);

  if (loading) return <div className="cp-vo-loading">Loading VOs&#8230;</div>;
  if (!vos) return null; // no VOs — render nothing

  const lumpRow = vos.find((v) => v.vo_number === LUMP_LABEL);
  const voNum = (s) => {
    const m = (s || "").match(/VO\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : Infinity;
  };
  const voRows = vos
    .filter((v) => v.vo_number !== LUMP_LABEL)
    .sort((a, b) => {
      const na = voNum(a.vo_number), nb = voNum(b.vo_number);
      if (na !== nb) return na - nb;
      return (a.vo_number || "").localeCompare(b.vo_number || "");
    });
  const realCount = voRows.length;

  return (
    <div className="cp-vo">
      <div className="cp-vo-header">
        <span className="cp-vo-title">Variation Orders ({realCount})</span>
        {contractBase != null && voValue != null && totalContract != null && (
          <span className="cp-vo-summary">
            Contract {fmt(contractBase)} + VOs {fmt(voValue)} = {fmt(totalContract)} total
          </span>
        )}
      </div>

      {lumpRow && (
        <div className="cp-vo-lump" title={lumpRow.description || ""}>
          <span className="cp-vo-lump-label">Unallocated VO value:</span>{" "}
          <span className="cp-vo-lump-amt">{fmt(Number(lumpRow.amount))}</span>
          <span className="cp-vo-lump-note"> — recorded on the contract, not yet split to individual VOs.</span>
        </div>
      )}

      {realCount > 0 && (
        <table className="cp-vo-table">
          <colgroup>
            <col className="cp-col-vo" />
            <col className="cp-col-ref" />
            <col className="cp-col-amt" />
          </colgroup>
          <thead>
            <tr>
              <th>VO</th>
              <th>Quotation Ref</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {voRows.map((v, i) => {
              const amt = v.amount != null ? Number(v.amount) : null;
              const isRefOnly = amt === 0 || amt == null;
              return (
                <tr key={i}>
                  <td className="cp-vo-name">{v.vo_number}</td>
                  <td className="cp-vo-ref">{v.quotation_ref || <span className="cp-muted">&mdash;</span>}</td>
                  <td className="r">
                    {isRefOnly ? (
                      <span className="cp-vo-dash" title={lumpRow ? "Value in unallocated" : ""}>&mdash;</span>
                    ) : (
                      fmtFull(amt)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="cp-vo-footer">
        <span className="cp-vo-footer-label">VO total (authoritative)</span>
        <span className="cp-vo-footer-val">{fmtFull(voValue)}</span>
      </div>
    </div>
  );
}

// ============================================================================
// CHASE TABLE
// ============================================================================
function ChaseTable({ items }) {
  if (items.length === 0)
    return <div className="cp-empty">Nothing to chase &mdash; no claims are 30+ days old and unpaid.</div>;

  return (
    <div className="cp-chase-wrap">
      <table className="cp-chase">
        <thead>
          <tr>
            <th>Action</th>
            <th>Project</th>
            <th>Claim</th>
            <th>Age</th>
            <th className="r">Amount</th>
            <th>Contact</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c, i) => (
            <tr key={i}>
              <td>
                <span className={`cp-chase-type ${c.kind === "payment_due" ? "cp-chase-pay" : "cp-chase-cert"}`}>
                  {c.kind === "payment_due" ? "Chase payment" : "Chase certification"}
                </span>
              </td>
              <td>
                <div className="cp-chase-proj">{c.code}</div>
                <div className="cp-chase-client">{cleanClient(c.client)} &middot; {cleanName(c.name)}</div>
              </td>
              <td>#{c.claim_no ?? "—"}</td>
              <td><span className="cp-chase-age"><strong>{c.age}</strong> days</span></td>
              <td className="r">
                <span className="cp-chase-amt">{fmtFull(c.kind === "payment_due" ? c.certified : c.amount)}</span>
              </td>
              <td>
                {c.contact && <div className="cp-chase-name">{c.contact}</div>}
                {c.phone && <div className="cp-phone">{c.phone}</div>}
                {!c.contact && !c.phone && <span className="cp-muted">&mdash;</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// SHELL + STYLES
// ============================================================================
function Shell({ children }) {
  return (
    <div className="cp-root">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

const CSS = `
/* ── Tokens ── */
.cp-root {
  --navy: #1C2340;
  --navy-50: #F0F1F5;
  --navy-100: #E1E3EB;
  --orange: #F7901E;
  --orange-ink: #92400E;
  --orange-50: #FFFBF5;
  --green: #16A34A;
  --green-50: #F0FDF4;
  --green-ink: #166534;
  --red: #B91C1C;
  --bg: #FAFBFC;
  --surface: #FFFFFF;
  --border: #D4D6DB;
  --border-lt: #E5E7EB;
  --fg: #111827;
  --fg2: #1F2937;
  --fg3: #4B5563;
  --fg4: #6B7280;
  --radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: var(--fg);
  background: var(--bg);
  padding: 20px 24px;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
.cp-root *, .cp-root *::before, .cp-root *::after { box-sizing: border-box; }

/* ── States ── */
.cp-loading, .cp-empty { padding: 48px; text-align: center; color: var(--fg3); font-size: 14px; }
.cp-error { padding: 20px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--radius); color: #991B1B; font-size: 13px; }
.cp-error-hint { margin-top: 6px; font-size: 12px; color: var(--fg3); }

/* ── Header ── */
.cp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.cp-header-left { display: flex; align-items: center; gap: 10px; }
.cp-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border-radius: 6px;
  color: var(--fg3);
  text-decoration: none;
  transition: background 150ms ease-out, color 150ms ease-out;
}
.cp-back:hover { background: var(--navy-50); color: var(--fg); }
.cp-title { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; color: var(--navy); }
.cp-stats { font-size: 12px; color: var(--fg3); }

/* ── Tabs ── */
.cp-tabs {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 3px;
}
.cp-tab {
  position: relative;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg3);
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease-out, color 150ms ease-out;
}
.cp-tab:hover { color: var(--fg); }
.cp-tab:active { transform: scale(0.97); }
.cp-tab.on { background: var(--navy); color: #fff; }
.cp-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px; height: 16px;
  padding: 0 5px;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  background: var(--orange);
  color: #fff;
  border-radius: 99px;
}
.cp-tab.on .cp-badge { background: rgba(255,255,255,0.25); }

/* ── Summary ── */
.cp-summary { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.cp-stat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  min-width: 180px;
}
.cp-stat-warn { border-left: 3px solid var(--orange); }
.cp-stat-info { border-left: 3px solid var(--navy); }
.cp-stat-val { display: block; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.cp-stat-lbl { display: block; font-size: 12px; color: var(--fg3); margin-top: 2px; }

/* ── Portfolio strip ── */
.cp-portfolio {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  margin-bottom: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  flex-wrap: wrap;
}
.cp-pf-item { display: flex; align-items: baseline; gap: 5px; }
.cp-pf-label { color: var(--fg3); font-weight: 600; }
.cp-pf-val { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--fg); }
.cp-pf-sep { color: var(--fg4); }
.cp-pf-highlight .cp-pf-val { color: var(--orange-ink); }

/* ── Controls ── */
.cp-controls { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.cp-search {
  flex: 1; min-width: 200px;
  font-family: inherit; font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
}
.cp-search:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 3px rgba(28,35,64,0.08); }
.cp-select {
  font-family: inherit; font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* PIVOT GRID                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */
.cp-grid-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
}
.cp-grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.cp-grid th {
  position: sticky; top: 0;
  background: var(--bg);
  font-weight: 600; font-size: 10px;
  color: var(--fg3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 8px 10px;
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
  z-index: 2;
}
.cp-th-proj { text-align: left !important; position: sticky; left: 0; z-index: 3 !important; background: var(--bg) !important; }
.cp-th-month { min-width: 60px; }
.cp-th-total { min-width: 80px; }

/* Rows */
.cp-grid tbody tr { cursor: pointer; transition: background 120ms ease-out; }
.cp-grid tbody tr:hover { background: var(--navy-50); }
.cp-grid tbody tr:active { background: var(--navy-100); }
.cp-row-open { background: var(--navy-50) !important; }

.cp-grid td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-lt);
  text-align: right;
  vertical-align: middle;
  font-variant-numeric: tabular-nums;
}

/* Sticky project col */
.cp-col-proj {
  position: sticky; left: 0; z-index: 1;
  background: var(--surface);
  text-align: left !important;
  min-width: 200px; max-width: 220px;
  border-right: 1px solid var(--border-lt);
}
.cp-grid tbody tr:hover .cp-col-proj,
.cp-row-open .cp-col-proj { background: var(--navy-50); }

.cp-code { display: block; font-weight: 700; font-size: 13px; color: var(--navy); line-height: 1.3; }
.cp-pname { display: block; font-size: 12px; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.cp-client { display: block; font-size: 11px; color: var(--fg3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }

.cp-col-contract { color: var(--fg2); min-width: 80px; }
.cp-col-total { font-weight: 700; min-width: 80px; }
.cp-col-cert { color: var(--navy); }
.cp-col-toclaim { color: var(--fg2); }
.cp-toclaim-high { color: var(--orange-ink) !important; font-weight: 800 !important; }
.cp-toclaim-zero { color: var(--fg4) !important; font-weight: 500 !important; }

/* Month cells */
.cp-cell-empty { }
.cp-cell-certified .cp-cell-amt { color: var(--green-ink); }
.cp-cell-submitted { background: var(--orange-50); }
.cp-cell-submitted .cp-cell-amt { color: var(--orange-ink); font-weight: 600; }
.cp-cell-amt { display: block; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
.cp-cell-no { display: block; font-size: 10px; color: var(--fg4); margin-top: 1px; }

.cp-outstanding {
  display: inline-block;
  font-size: 10px; font-weight: 600;
  color: var(--orange-ink);
  margin-left: 4px;
}
.cp-muted { color: var(--fg4); }

/* ═══════════════════════════════════════════════════════════════════════════ */
/* DETAIL (expanded row)                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */
.cp-detail-row td {
  background: var(--bg) !important;
  padding: 0 !important;
  cursor: default !important;
}
.cp-detail-row .cp-col-proj { background: var(--bg) !important; }
.cp-detail {
  padding: 12px 16px 14px;
  animation: cpDetailIn 200ms cubic-bezier(0.23,1,0.32,1);
}
@keyframes cpDetailIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.cp-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  gap: 8px;
  flex-wrap: wrap;
}
.cp-detail-title { font-size: 14px; font-weight: 700; color: var(--navy); }
.cp-detail-contact { font-size: 12px; color: var(--fg3); display: flex; gap: 10px; }
.cp-phone { color: var(--orange-ink); font-weight: 600; }

.cp-dtable { width: 100%; border-collapse: collapse; font-size: 13px; }
.cp-dtable th {
  position: static; background: none;
  text-align: left; font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--fg4); padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}
.cp-dtable th.r { text-align: right; }
.cp-dtable td { padding: 6px 8px; border-bottom: 1px solid var(--border-lt); font-variant-numeric: tabular-nums; }
.cp-dtable td.r { text-align: right; font-weight: 700; }

.cp-pending { color: var(--orange-ink); font-style: italic; font-size: 12px; }
.cp-neg { color: var(--red); font-weight: 700; }
.cp-pos { color: var(--green-ink); font-weight: 700; }
.cp-pill {
  display: inline-block; font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.02em;
  padding: 2px 7px; border-radius: 99px;
}
.cp-pill-certified { background: var(--green-50); color: var(--green-ink); }
.cp-pill-submitted { background: var(--orange-50); color: var(--orange-ink); }

/* Reconciliation footer */
.cp-recon {
  display: flex;
  align-items: stretch;
  gap: 1px;
  margin-top: 10px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--border);
}
.cp-recon-item {
  flex: 1;
  background: var(--surface);
  padding: 10px 14px;
  font-variant-numeric: tabular-nums;
}
.cp-recon-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--fg3);
  margin-bottom: 2px;
}
.cp-recon-val {
  display: block;
  font-size: 15px;
  font-weight: 800;
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}
.cp-recon-toclaim .cp-recon-val { color: var(--fg3); }
.cp-recon-high { background: var(--orange-50); }
.cp-recon-high .cp-recon-val { color: var(--orange-ink); font-weight: 800; }
.cp-recon-zero .cp-recon-val { color: var(--fg4); font-weight: 500; }

/* ═══════════════════════════════════════════════════════════════════════════ */
/* VO SECTION                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
.cp-vo {
  margin-top: 14px;
  max-width: 640px;
}
.cp-vo-loading { font-size: 13px; color: var(--fg3); padding: 8px 0; }
.cp-vo-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.cp-vo-title { font-size: 14px; font-weight: 700; color: var(--navy); }
.cp-vo-summary { font-size: 13px; color: var(--fg2); font-variant-numeric: tabular-nums; }

.cp-vo-lump {
  padding: 10px 14px;
  margin-bottom: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--orange-ink);
  border-radius: 6px;
  font-size: 13px;
  font-style: italic;
  color: var(--fg2);
  line-height: 1.5;
  cursor: help;
}
.cp-vo-lump-label { font-weight: 700; color: var(--fg); font-style: normal; }
.cp-vo-lump-amt { font-weight: 800; color: var(--fg); font-style: normal; font-variant-numeric: tabular-nums; }
.cp-vo-lump-note { color: var(--fg3); }

.cp-vo-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.cp-vo-table col.cp-col-vo { width: 110px; }
.cp-vo-table col.cp-col-ref { }
.cp-vo-table col.cp-col-amt { width: 120px; }
.cp-vo-table th {
  position: static; background: none;
  text-align: left; font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--fg3); padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}
.cp-vo-table th.r { text-align: right; }
.cp-vo-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-lt);
  font-variant-numeric: tabular-nums;
  text-align: left;
}
.cp-vo-table td.r { text-align: right; font-weight: 700; }
.cp-vo-name { font-weight: 700; color: var(--fg); white-space: nowrap; }
.cp-vo-ref { font-size: 13px; color: var(--fg2); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-vo-dash { color: var(--fg4); cursor: help; }

.cp-vo-footer {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 8px;
  padding: 8px;
  border-top: 1px solid var(--border);
  font-size: 13px;
}
.cp-vo-footer-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; color: var(--fg3); }
.cp-vo-footer-val { font-weight: 800; font-size: 14px; color: var(--navy); font-variant-numeric: tabular-nums; }

/* ═══════════════════════════════════════════════════════════════════════════ */
/* CHASE TABLE                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */
.cp-chase-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
}
.cp-chase { width: 100%; border-collapse: collapse; font-size: 13px; }
.cp-chase th {
  position: sticky; top: 0;
  background: var(--bg);
  font-weight: 600; font-size: 10px;
  color: var(--fg3);
  text-transform: uppercase; letter-spacing: 0.04em;
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.cp-chase th.r { text-align: right; }
.cp-chase td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-lt);
  vertical-align: middle;
  font-variant-numeric: tabular-nums;
}
.cp-chase td.r { text-align: right; }
.cp-chase tbody tr { transition: background 120ms ease-out; }
.cp-chase tbody tr:hover { background: var(--navy-50); }

.cp-chase-type {
  display: inline-block; font-size: 11px; font-weight: 700;
  padding: 4px 10px; border-radius: 99px; white-space: nowrap;
}
.cp-chase-pay { background: var(--orange-50); color: var(--orange-ink); }
.cp-chase-cert { background: var(--navy-50); color: var(--navy); }

.cp-chase-age { font-size: 13px; color: var(--fg2); }
.cp-chase-age strong { font-weight: 800; color: var(--fg); }
.cp-chase-amt { font-weight: 800; font-size: 14px; font-variant-numeric: tabular-nums; color: var(--fg); }
.cp-chase-proj { font-weight: 700; color: var(--navy); font-size: 13px; }
.cp-chase-client { font-size: 12px; color: var(--fg3); }
.cp-chase-name { font-size: 12px; color: var(--fg2); }

/* ── Responsive ── */
@media (max-width: 640px) {
  .cp-root { padding: 12px; }
  .cp-header { flex-direction: column; align-items: flex-start; }
  .cp-summary { flex-direction: column; }
  .cp-portfolio { flex-direction: column; gap: 4px; }
  .cp-pf-sep { display: none; }
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .cp-detail { animation: none; }
  .cp-tab, .cp-grid tbody tr, .cp-back, .cp-chase tbody tr, .cp-search { transition: none; }
}
`;
