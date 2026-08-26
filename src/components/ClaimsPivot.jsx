import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";

/*
  ConPlus — Claims Pivot & Payment Chase (v4 — Two-clock engine)
  ---------------------------------------------------------------
  Reads `claims` joined to `projects` for the pivot grid.
  Reads `project_claim_summary` for billable_contract and to_claim.
  Reads `certificate_chase` and `payment_chase` views for the chase tabs.

  Uses the app's shared Supabase client. Do NOT add createClient here.
*/

// ---- helpers ---------------------------------------------------------------
const fmt = (n) =>
  n == null ? "\u2014" : n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });
const fmtFull = (n) =>
  n == null ? "\u2014" : n.toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return "\u2014";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
};

const monthKey = (d) => (d ? d.slice(0, 7) : null);
const monthLabel = (key) => {
  if (!key) return "\u2014";
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
  if (n == null) return "\u2014";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1000) return sign + (abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1) + "k";
  return sign + Math.round(abs).toString();
}
function cellTitle(c) {
  return `Claim #${c.claim_no ?? "\u2014"} \u00B7 ${c.status}\nClaimed ${fmtFull(c.amount)}\nCertified ${
    c.certified == null ? "pending" : fmtFull(c.certified)
  }`;
}

// ---- email templates -------------------------------------------------------
// Certificate-clock: drafted defaults (client hasn't provided their wording yet).
// Payment-clock: VERBATIM from client's "Account – Payment-Chase Setup".
// All emails use "Dear Sir/Madam" per client standard — no personalisation.

const fmtNum = (n) =>
  n == null ? "[amount]" : Number(n).toLocaleString("en-SG", { minimumFractionDigits: 2 });

const deadlineIn7 = () => {
  const d = new Date(Date.now() + 7 * 86400000);
  return fmtDate(d.toISOString().slice(0, 10));
};

function getCertEmail(row) {
  const claimNo = row.claim_no || "-";
  const proj = `${row.project_name} (${row.project_code})`;
  const daysOver = Math.abs(row.days_to_due || 0);
  switch (row.stage) {
    case "t-4":
      return {
        subject: `Payment Response Certificate \u2014 ${row.project_name} (Claim ${claimNo})`,
        body: `Dear Sir/Madam,\n\nWe refer to our Progress Claim ${claimNo} for ${proj}, submitted on ${fmtDate(row.anchor_date)} for ${fmtFull(row.amount)}.\n\nThe Payment Response Certificate is due by ${fmtDate(row.due_date)}. We would appreciate it if you could arrange for the certificate to be issued by the due date.\n\nThank you.`,
      };
    case "due":
      return {
        subject: `Payment Response Certificate Due Today \u2014 ${row.project_name}`,
        body: `Dear Sir/Madam,\n\nWe refer to our Progress Claim ${claimNo} for ${proj}, submitted on ${fmtDate(row.anchor_date)} for ${fmtFull(row.amount)}.\n\nThe Payment Response Certificate is due today (${fmtDate(row.due_date)}). Kindly arrange for the certificate to be issued. Please let us know if you require any further information.\n\nThank you.`,
      };
    case "overdue":
      return {
        subject: `Overdue: Payment Response Certificate \u2014 ${row.project_name} (Claim ${claimNo})`,
        body: `Dear Sir/Madam,\n\nWe refer to our Progress Claim ${claimNo} for ${proj}, submitted on ${fmtDate(row.anchor_date)} for ${fmtFull(row.amount)}.\n\nThe Payment Response Certificate was due on ${fmtDate(row.due_date)} and is now ${daysOver} days overdue. We would be grateful if you could arrange for it to be issued at the earliest, or advise us of the expected date.\n\nThank you.`,
      };
    default:
      return null; // not_due, t-7 — too early to chase
  }
}

function getPayEmail(row) {
  const deadline = deadlineIn7();
  const amt = fmtNum(row.invoice_amount);
  switch (row.stage) {
    case "soa":
      return {
        subject: `Statement of Account \u2014 ${row.project_name}`,
        body: `Dear Sir/Madam,\n\nGood day.\n\nPlease refer to the attached herewith the SOA for your reference.\n\nThank you.`,
      };
    case "soa_overdue":
      return {
        subject: `Statement of Account (Outstanding) \u2014 ${row.project_name}`,
        body: `Dear Sir/Madam,\n\nGood day.\n\nPlease refer to the attached herewith the SOA for your reference.\n\nMay I seek your kind assistance to check the payment status for the outstanding invoice please.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.`,
      };
    case "1st":
      return {
        subject: `1st Reminder \u2014 Overdue Payment \u2014 ${row.project_name}`,
        body: `Dear Sir/Madam,\n\nGood day.\n\nPlease refer to the attached herewith the Statement of Account for your reference.\n\nPlease be informed that your account is long OVERDUE.\n\nKindly advise the payment status by ${deadline}.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.`,
      };
    case "2nd":
      return {
        subject: `2nd Reminder \u2014 Overdue Payment \u2014 ${row.project_name}`,
        body: `Dear Sir/Madam,\n\nGood day.\n\nPlease refer to the attached herewith the Statement of Account for your reference.\n\nPlease be informed that your account is long OVERDUE.\n\nKindly advise the payment status by ${deadline}.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.`,
      };
    case "final":
      return {
        subject: `Final Reminder \u2014 Overdue Payment \u2014 ${row.project_name}`,
        body: null,
        variants: [
          {
            id: "legal",
            label: "Legal Action",
            body: `Dear Sir/Madam,\n\nPlease refer to the attached herewith the Statement of Account for your reference.\n\nPlease be informed that your account is long OVERDUE.\n\nWe will expect the full settlement of all outstanding payment SGD ${amt} by ${deadline}.\n\nWithout prejudice to our rights, if the said payment for the amount of SGD ${amt} is not received in full by ${deadline}, we will commence legal proceedings to recover the debt without further notice to you and this email may be tendered in court as evidence of your failure to pay.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.`,
          },
          {
            id: "termination",
            label: "Work Termination",
            body: `Dear Sir/Madam,\n\nPlease refer to the attached herewith the Statement of Account for your reference.\n\nPlease be informed that your account is long OVERDUE.\n\nWe will expect the full settlement of all outstanding payment SGD ${amt} by ${deadline}.\n\nWithout prejudice to our rights, if the said payment for the amount of SGD ${amt} is not received in full by ${deadline}, we will be unable to mobilize our manpower to provide further services. Also, we will not be responsible for all the charges due to the outstanding work.\n\nWe would appreciate your immediate attention to this matter.\n\nThank you.`,
          },
        ],
      };
    default:
      return null;
  }
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

  // Chase state
  const [chaseTab, setChaseTab] = useState("certificate");
  const [certRows, setCertRows] = useState([]);
  const [payRows, setPayRows] = useState([]);

  const fetchChase = useCallback(async () => {
    const [certRes, payRes] = await Promise.all([
      supabase.from("certificate_chase").select("*"),
      supabase.from("payment_chase").select("*"),
    ]);
    if (!certRes.error) setCertRows(certRes.data || []);
    if (!payRes.error) setPayRows(payRes.data || []);
  }, []);

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

        await fetchChase();
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchChase]);

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

  const chaseCount = certRows.length + payRows.length;

  return (
    <Shell>
      {/* -- Header -- */}
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
            Chase
            {chaseCount > 0 && <span className="cp-badge">{chaseCount}</span>}
          </button>
        </div>
      </header>

      {/* -- Controls (pivot only) -- */}
      {view === "pivot" && (
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
          <select className="cp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All projects</option>
            <option value="outstanding">Has outstanding</option>
          </select>
        </div>
      )}

      {/* -- Views -- */}
      {view === "pivot" ? (
        <>
          <PortfolioStrip portfolio={portfolio} />
          <PivotGrid projects={projects} months={months} expanded={expanded} setExpanded={setExpanded} />
        </>
      ) : (
        <ChasePanel
          chaseTab={chaseTab}
          setChaseTab={setChaseTab}
          certRows={certRows}
          payRows={payRows}
          onRefresh={fetchChase}
        />
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
                        <span className="cp-cell-no">#{c.claim_no ?? "\u2014"}</span>
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
                <td>#{c.claim_no ?? "\u2014"}</td>
                <td>{monthLabel(monthKey(c.claim_date))}</td>
                <td className="r">{fmtFull(c.amount)}</td>
                <td className="r">{c.certified == null ? <em className="cp-pending">pending</em> : fmtFull(c.certified)}</td>
                <td className={`r ${variance != null && variance < 0 ? "cp-neg" : ""} ${variance != null && variance > 0 ? "cp-pos" : ""}`}>
                  {variance == null ? "\u2014" : (variance >= 0 ? "+" : "") + fmtFull(variance)}
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
          <span className="cp-recon-val">{project.toClaim == null ? "\u2014" : fmtFull(project.toClaim)}</span>
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
          <span className="cp-vo-lump-note"> \u2014 recorded on the contract, not yet split to individual VOs.</span>
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
// CHASE PANEL (two-clock engine — Step 16 aligned)
// ============================================================================
function ChasePanel({ chaseTab, setChaseTab, certRows, payRows, onRefresh }) {
  const [emailModal, setEmailModal] = useState(null);
  const [holdModal, setHoldModal] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const clock = chaseTab === "certificate" ? "certificate" : "payment";
  const rows = chaseTab === "certificate" ? certRows : payRows;

  // Split into action vs full list
  const actionRows = rows.filter((r) => r.needs_action_today);
  const allRows = rows;

  const isCertOverdue = (row) => row.stage === "overdue";
  const isPayOverdue = (row) => ["final", "2nd", "soa_overdue"].includes(row.stage);
  const isOverdue = (row) => (clock === "certificate" ? isCertOverdue(row) : isPayOverdue(row));

  const showFeedback = (msg) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleProceed = async (row, subject, body, isManual) => {
    try {
      const params = {
        p_claim_id: row.claim_id,
        p_clock: clock,
        p_decision: "proceed",
        p_stage: row.stage,
        p_email_to: row.contact_person || null,
        p_email_subject: subject,
        p_email_body: body,
        p_created_by: null,
      };
      if (isManual) params.p_is_manual = true;
      const { data, error } = await supabase.rpc("log_chase_reminder", params);
      if (error) { showFeedback("Error: " + error.message); }
      else { showFeedback(`Logged as reminder #${data?.reminder_no ?? "?"}`); }
    } catch (e) { showFeedback("Error: " + e.message); }
    setEmailModal(null);
    await onRefresh();
  };

  const handleIgnore = async (row, subject, body) => {
    try {
      await supabase.rpc("log_chase_reminder", {
        p_claim_id: row.claim_id,
        p_clock: clock,
        p_decision: "ignore",
        p_stage: row.stage,
        p_email_to: row.contact_person || null,
        p_email_subject: subject,
        p_email_body: body,
        p_created_by: null,
      });
      showFeedback("Skipped this cycle.");
    } catch (e) { showFeedback("Error: " + e.message); }
    setEmailModal(null);
    await onRefresh();
  };

  const handleSetHold = async (claimId, reason, note, resumeDate) => {
    try {
      await supabase.rpc("set_chase_hold", {
        p_claim_id: claimId,
        p_reason: reason,
        p_clock: clock,
        p_reason_note: note || null,
        p_resume_date: resumeDate || null,
      });
      showFeedback("Hold set.");
    } catch (e) { showFeedback("Error: " + e.message); }
    setHoldModal(null);
    await onRefresh();
  };

  const handleReleaseHold = async (claimId) => {
    try {
      await supabase.rpc("release_chase_hold", {
        p_claim_id: claimId,
        p_clock: clock,
      });
      showFeedback("Hold released.");
    } catch (e) { showFeedback("Error: " + e.message); }
    await onRefresh();
  };

  const handleDateUpdate = async (claimId, field, value) => {
    try {
      const { error } = await supabase.from("claims").update({ [field]: value || null }).eq("id", claimId);
      if (error) { showFeedback("Error: " + error.message); }
      else { showFeedback(`${field.replace("_", " ")} recorded.`); }
    } catch (e) { showFeedback("Error: " + e.message); }
    await onRefresh();
  };

  const openDraft = (row, isManual) => {
    const email = clock === "certificate" ? getCertEmail(row) : getPayEmail(row);
    if (!email) return;
    setEmailModal({ row, clock, email, isManual });
  };

  // Summary
  const totalAmount = rows.reduce((s, r) => {
    const amt = clock === "certificate" ? Number(r.amount || 0) : Number(r.invoice_amount || 0);
    return s + amt;
  }, 0);
  const overdueCount = rows.filter(isOverdue).length;
  const heldCount = rows.filter((r) => r.on_hold).length;

  // Shared row renderer
  const renderRow = (row) => {
    const overdue = isOverdue(row);
    const held = row.on_hold;
    const email = clock === "certificate" ? getCertEmail(row) : getPayEmail(row);
    const amt = clock === "certificate" ? row.amount : row.invoice_amount;
    const daysVal = row.days_to_due;
    let daysLabel = "\u2014";
    if (daysVal != null) {
      if (daysVal > 0) daysLabel = `${daysVal}d left`;
      else if (daysVal === 0) daysLabel = "Due today";
      else daysLabel = `${Math.abs(daysVal)}d over`;
    }

    return (
      <tr
        key={row.claim_id}
        className={`${overdue ? "cp-chase-row-over" : ""} ${held ? "cp-chase-row-held" : ""}`}
      >
        <td>
          <span className={`cp-stage cp-stage-${row.stage?.replace(/[^a-z0-9]/g, "")}`}>
            {row.stage?.replace(/_/g, " ")}
          </span>
          {held && <span className="cp-hold-badge">HELD</span>}
          {row.awareness_only && <span className="cp-awareness-tag">Heads-up</span>}
        </td>
        <td>
          <div className="cp-chase-proj">{row.project_code}</div>
          <div className="cp-chase-client">
            {cleanClient(row.client_name)} &middot; {cleanName(row.project_name)}
          </div>
          {row.contact_person && (
            <div className="cp-chase-contact">{row.contact_person}</div>
          )}
          {row.notify_salesperson && row.sales_manager && (
            <div className="cp-salesperson-tag">Notify salesperson: {row.sales_manager}</div>
          )}
        </td>
        <td>#{row.claim_no ?? "\u2014"}</td>
        <td>
          <span className={`cp-chase-days${overdue ? " cp-days-over" : ""}`}>
            {daysLabel}
          </span>
          {overdue && row.overdue_weeks != null && (
            <div className="cp-overdue-weeks">{row.overdue_weeks} wks</div>
          )}
          {/* Next-flag indicator */}
          {!row.needs_action_today && row.next_reminder_label && row.days_to_next_flag != null && row.days_to_next_flag > 0 && (
            <div className="cp-next-flag">
              {row.last_sent_at ? (
                <>
                  <span className="cp-next-sent">{"\u2713"} {row.reminders_sent ? `#${row.reminders_sent}` : "Sent"} {row.days_since_last_sent}d ago</span>
                  {" \u00B7 "}
                </>
              ) : null}
              Next: {row.next_reminder_label} in {row.days_to_next_flag}d
            </div>
          )}
          {row.last_sent_at && row.needs_action_today && (
            <div className="cp-next-flag cp-next-ready">
              <span className="cp-next-sent">{"\u2713"} #{row.reminders_sent} sent {row.days_since_last_sent}d ago</span>
              {" \u2014 due now"}
            </div>
          )}
        </td>
        <td className="r">
          <span className="cp-chase-amt">{fmtFull(amt)}</span>
        </td>
        <td className="cp-chase-remcol">{row.reminders_sent || 0}</td>
        <td className="cp-chase-datecol">
          {clock === "certificate" && (
            <>
              <label className="cp-date-row">
                <span className="cp-date-tag">PRC</span>
                <input
                  type="date"
                  className="cp-date-input"
                  onChange={(e) => handleDateUpdate(row.claim_id, "prc_date", e.target.value)}
                />
              </label>
              <label className="cp-date-row">
                <span className="cp-date-tag">Cert$</span>
                <input
                  type="number"
                  className="cp-date-input cp-amt-input"
                  placeholder="Certified amt"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v) handleDateUpdate(row.claim_id, "certified_amount", parseFloat(v));
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                />
              </label>
              <label className="cp-date-row">
                <span className="cp-date-tag">Inv</span>
                <input
                  type="date"
                  className="cp-date-input"
                  onChange={(e) => handleDateUpdate(row.claim_id, "invoice_date", e.target.value)}
                />
              </label>
            </>
          )}
          {clock === "payment" && (
            <label className="cp-date-row">
              <span className="cp-date-tag">Paid</span>
              <input
                type="date"
                className="cp-date-input"
                onChange={(e) => handleDateUpdate(row.claim_id, "paid_date", e.target.value)}
              />
            </label>
          )}
        </td>
        <td className="cp-chase-actcol">
          {email && !held && (
            <button className="cp-btn cp-btn-draft" onClick={() => openDraft(row, false)}>
              Draft
            </button>
          )}
          {/* Manual reminder — available on ANY row */}
          {!held && (
            <button className="cp-btn cp-btn-manual" onClick={() => openDraft(row, true)} title="Prepare a reminder outside the normal cadence">
              Manual
            </button>
          )}
          {held ? (
            <button className="cp-btn cp-btn-release" onClick={() => handleReleaseHold(row.claim_id)}>
              Release
            </button>
          ) : (
            <button className="cp-btn cp-btn-hold" onClick={() => setHoldModal({ row, clock })}>
              Hold
            </button>
          )}
        </td>
      </tr>
    );
  };

  const tableHead = (
    <thead>
      <tr>
        <th>Stage</th>
        <th className="cp-th-proj">Project</th>
        <th>Claim</th>
        <th>Days</th>
        <th className="r">Amount</th>
        <th className="cp-th-rem">#</th>
        <th>Record date</th>
        <th>Actions</th>
      </tr>
    </thead>
  );

  return (
    <>
      {/* Sub-tabs */}
      <div className="cp-chase-subtabs">
        <button
          className={`cp-chase-subtab${chaseTab === "certificate" ? " on" : ""}`}
          onClick={() => setChaseTab("certificate")}
        >
          Certificate
          {certRows.length > 0 && <span className="cp-badge">{certRows.length}</span>}
        </button>
        <button
          className={`cp-chase-subtab${chaseTab === "payment" ? " on" : ""}`}
          onClick={() => setChaseTab("payment")}
        >
          Payment
          {payRows.length > 0 && <span className="cp-badge">{payRows.length}</span>}
        </button>
      </div>

      {/* Summary strip */}
      <div className="cp-summary">
        <div className="cp-stat cp-stat-warn">
          <span className="cp-stat-val">{fmt(totalAmount)}</span>
          <span className="cp-stat-lbl">{clock === "certificate" ? "Awaiting PRC" : "Awaiting payment"}</span>
        </div>
        {actionRows.length > 0 && (
          <div className="cp-stat cp-stat-action">
            <span className="cp-stat-val">{actionRows.length}</span>
            <span className="cp-stat-lbl">Needs action today</span>
          </div>
        )}
        {overdueCount > 0 && (
          <div className="cp-stat cp-stat-danger">
            <span className="cp-stat-val">{overdueCount}</span>
            <span className="cp-stat-lbl">Overdue</span>
          </div>
        )}
        {heldCount > 0 && (
          <div className="cp-stat">
            <span className="cp-stat-val">{heldCount}</span>
            <span className="cp-stat-lbl">On hold</span>
          </div>
        )}
      </div>

      {/* Feedback toast */}
      {feedback && <div className="cp-toast">{feedback}</div>}

      {/* Section 1: Needs action today */}
      {actionRows.length > 0 && (
        <>
          <div className="cp-section-head cp-section-action">
            <span className="cp-section-dot" />
            Needs action today
            <span className="cp-section-count">{actionRows.length}</span>
          </div>
          <div className="cp-chase-wrap cp-chase-action-wrap">
            <table className="cp-chase">{tableHead}<tbody>{actionRows.map(renderRow)}</tbody></table>
          </div>
        </>
      )}

      {/* Section 2: All in progress */}
      <div className="cp-section-head">
        All in progress
        <span className="cp-section-count">{allRows.length}</span>
      </div>
      {allRows.length === 0 ? (
        <div className="cp-empty">Nothing to chase here.</div>
      ) : (
        <div className="cp-chase-wrap">
          <table className="cp-chase">{tableHead}<tbody>{allRows.map(renderRow)}</tbody></table>
        </div>
      )}

      {/* Email preview modal */}
      {emailModal && (
        <EmailPreviewModal
          row={emailModal.row}
          clock={emailModal.clock}
          email={emailModal.email}
          isManual={emailModal.isManual}
          onProceed={(subj, body) => handleProceed(emailModal.row, subj, body, emailModal.isManual)}
          onIgnore={(subj, body) => handleIgnore(emailModal.row, subj, body)}
          onClose={() => setEmailModal(null)}
        />
      )}

      {/* Hold modal */}
      {holdModal && (
        <HoldModal
          row={holdModal.row}
          onConfirm={(reason, note, date) => handleSetHold(holdModal.row.claim_id, reason, note, date)}
          onClose={() => setHoldModal(null)}
        />
      )}
    </>
  );
}

// ============================================================================
// EMAIL PREVIEW MODAL (with variant picker for Final Reminder)
// ============================================================================
function EmailPreviewModal({ row, clock, email, isManual, onProceed, onIgnore, onClose }) {
  const [copied, setCopied] = useState("");
  const [variant, setVariant] = useState(null); // for final reminder variant selection
  const hasVariants = email.variants && email.variants.length > 0;

  // Resolve the active body — either single body or selected variant
  const activeBody = hasVariants
    ? (variant ? email.variants.find((v) => v.id === variant)?.body : null)
    : email.body;
  const canProceed = activeBody != null;

  const copyText = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    }
  };

  const isPayment = clock === "payment";
  const claimNo = row.claim_no || "-";

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-head">
          <h3 className="cp-modal-title">
            {isManual ? "Manual Reminder" : "Draft Reminder"} &mdash; {row.project_code} #{claimNo}
          </h3>
          <button className="cp-modal-x" onClick={onClose}>&times;</button>
        </div>

        <div className="cp-modal-content">
          {/* Subject */}
          <div className="cp-modal-field">
            <div className="cp-modal-flabel">
              <span>Subject</span>
              <button className="cp-btn-copy" onClick={() => copyText(email.subject, "subject")}>
                {copied === "subject" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="cp-modal-fvalue">{email.subject}</div>
          </div>

          {/* Variant picker (Final Reminder only) */}
          {hasVariants && (
            <div className="cp-modal-field">
              <div className="cp-modal-flabel"><span>Select variant</span></div>
              <div className="cp-variant-picker">
                {email.variants.map((v) => (
                  <button
                    key={v.id}
                    className={`cp-variant-btn${variant === v.id ? " on" : ""}`}
                    onClick={() => setVariant(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {!variant && <div className="cp-variant-hint">Please select a variant before proceeding.</div>}
            </div>
          )}

          {/* Body */}
          {activeBody && (
            <div className="cp-modal-field">
              <div className="cp-modal-flabel">
                <span>Body</span>
                <button className="cp-btn-copy" onClick={() => copyText(activeBody, "body")}>
                  {copied === "body" ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="cp-modal-body">{activeBody}</pre>
            </div>
          )}

          {/* Hints */}
          <div className="cp-modal-hint">
            Copy the subject and body into your mail client. Your signature appends automatically on send.
            {isPayment && (
              <><br /><strong>Remember to attach the Statement of Account (SOA).</strong></>
            )}
          </div>
        </div>

        <div className="cp-modal-actions">
          <button
            className="cp-btn cp-btn-proceed"
            disabled={!canProceed}
            onClick={() => canProceed && onProceed(email.subject, activeBody)}
          >
            Log as Sent
          </button>
          <button className="cp-btn cp-btn-ignore" onClick={() => onIgnore(email.subject, activeBody || "")}>
            Skip This Cycle
          </button>
          <button className="cp-btn cp-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HOLD MODAL
// ============================================================================
function HoldModal({ row, onConfirm, onClose }) {
  const [reason, setReason] = useState("work_issue");
  const [note, setNote] = useState("");
  const [resumeDate, setResumeDate] = useState("");

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-modal cp-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-head">
          <h3 className="cp-modal-title">Hold &mdash; {row.project_code} #{row.claim_no}</h3>
          <button className="cp-modal-x" onClick={onClose}>&times;</button>
        </div>

        <div className="cp-modal-content">
          <label className="cp-form-group">
            <span className="cp-form-lbl">Reason</span>
            <select className="cp-select cp-form-input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="work_issue">Work Issue</option>
              <option value="agreed_date">Agreed Date</option>
              <option value="relationship">Relationship</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="cp-form-group">
            <span className="cp-form-lbl">Note (optional)</span>
            <textarea
              className="cp-textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Why is this on hold?"
            />
          </label>
          <label className="cp-form-group">
            <span className="cp-form-lbl">Resume date (optional)</span>
            <input
              type="date"
              className="cp-date-input cp-form-input"
              value={resumeDate}
              onChange={(e) => setResumeDate(e.target.value)}
            />
          </label>
        </div>

        <div className="cp-modal-actions">
          <button className="cp-btn cp-btn-proceed" onClick={() => onConfirm(reason, note, resumeDate || null)}>
            Set Hold
          </button>
          <button className="cp-btn cp-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
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
/* -- Tokens -- */
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
  --red-50: #FEF2F2;
  --red-ink: #991B1B;
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

/* -- States -- */
.cp-loading, .cp-empty { padding: 48px; text-align: center; color: var(--fg3); font-size: 14px; }
.cp-error { padding: 20px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--radius); color: #991B1B; font-size: 13px; }
.cp-error-hint { margin-top: 6px; font-size: 12px; color: var(--fg3); }

/* -- Header -- */
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

/* -- Tabs -- */
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

/* -- Summary -- */
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
.cp-stat-danger { border-left: 3px solid var(--red); }
.cp-stat-val { display: block; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.cp-stat-lbl { display: block; font-size: 12px; color: var(--fg3); margin-top: 2px; }
.cp-stat-danger .cp-stat-val { color: var(--red); }

/* -- Portfolio strip -- */
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

/* -- Controls -- */
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

/* ======================================================================= */
/* PIVOT GRID                                                                */
/* ======================================================================= */
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

/* ======================================================================= */
/* DETAIL (expanded row)                                                     */
/* ======================================================================= */
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

/* ======================================================================= */
/* VO SECTION                                                                */
/* ======================================================================= */
.cp-vo {
  margin-top: 14px;
  max-width: 720px;
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
.cp-vo-table col.cp-col-vo { width: 180px; }
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
.cp-vo-name { font-weight: 700; color: var(--fg); }
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

/* ======================================================================= */
/* CHASE — Sub-tabs                                                          */
/* ======================================================================= */
.cp-chase-subtabs {
  display: flex;
  gap: 2px;
  margin-bottom: 14px;
  background: var(--navy-50);
  border-radius: var(--radius);
  padding: 3px;
  width: fit-content;
}
.cp-chase-subtab {
  border: none;
  background: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg3);
  padding: 7px 16px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease-out, color 150ms ease-out;
}
.cp-chase-subtab:hover { color: var(--fg); background: rgba(255,255,255,0.5); }
.cp-chase-subtab.on { background: var(--surface); color: var(--navy); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.cp-chase-subtab .cp-badge { font-size: 10px; }

/* ======================================================================= */
/* CHASE TABLE                                                               */
/* ======================================================================= */
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
.cp-th-rem { width: 40px; text-align: center !important; }
.cp-chase td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-lt);
  vertical-align: middle;
  font-variant-numeric: tabular-nums;
}
.cp-chase td.r { text-align: right; }
.cp-chase tbody tr { transition: background 120ms ease-out; }
.cp-chase tbody tr:hover { background: var(--navy-50); }

/* Overdue rows */
.cp-chase-row-over { background: var(--red-50) !important; }
.cp-chase-row-over:hover { background: #FEE2E2 !important; }

/* Held rows */
.cp-chase-row-held { opacity: 0.55; }
.cp-chase-row-held:hover { opacity: 0.75; }

/* Stage badges */
.cp-stage {
  display: inline-block;
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.02em;
  padding: 3px 8px; border-radius: 99px;
  white-space: nowrap;
}
.cp-stage-notdue { background: var(--navy-50); color: var(--fg3); }
.cp-stage-t7 { background: var(--navy-50); color: var(--navy); }
.cp-stage-t4 { background: var(--orange-50); color: var(--orange-ink); }
.cp-stage-due { background: #FEF3C7; color: #92400E; }
.cp-stage-overdue { background: var(--red-50); color: var(--red-ink); }
.cp-stage-soa { background: var(--navy-50); color: var(--navy); }
.cp-stage-soaoverdue { background: var(--red-50); color: var(--red-ink); }
.cp-stage-1st { background: var(--orange-50); color: var(--orange-ink); }
.cp-stage-2nd { background: #FEE2E2; color: var(--red-ink); }
.cp-stage-final { background: var(--red-50); color: var(--red); font-weight: 800; }

.cp-hold-badge {
  display: inline-block;
  font-size: 9px; font-weight: 700;
  text-transform: uppercase;
  padding: 2px 5px; border-radius: 3px;
  background: var(--fg4); color: #fff;
  margin-left: 6px;
  vertical-align: middle;
}

/* Chase cell content */
.cp-chase-proj { font-weight: 700; color: var(--navy); font-size: 13px; }
.cp-chase-client { font-size: 12px; color: var(--fg3); }
.cp-chase-contact { font-size: 11px; color: var(--fg4); margin-top: 2px; }
.cp-chase-days { font-size: 13px; color: var(--fg2); white-space: nowrap; }
.cp-days-over { color: var(--red); font-weight: 700; }
.cp-overdue-weeks { font-size: 10px; color: var(--red-ink); margin-top: 2px; }
.cp-chase-amt { font-weight: 800; font-size: 14px; font-variant-numeric: tabular-nums; color: var(--fg); }
.cp-chase-remcol { text-align: center; font-weight: 700; color: var(--fg3); }

/* Date capture */
.cp-chase-datecol { min-width: 140px; }
.cp-date-row {
  display: flex; align-items: center; gap: 4px;
  margin-bottom: 4px;
  cursor: pointer;
}
.cp-date-row:last-child { margin-bottom: 0; }
.cp-date-tag {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  color: var(--fg3); width: 28px; flex-shrink: 0;
}
.cp-date-input {
  font-family: inherit; font-size: 12px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--fg);
  width: 110px;
}
.cp-date-input:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 2px rgba(28,35,64,0.08); }

/* Action buttons */
.cp-chase-actcol { white-space: nowrap; }
.cp-btn {
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
  background: var(--surface);
  color: var(--fg2);
  transition: background 120ms ease-out, border-color 120ms ease-out;
  margin-right: 4px;
}
.cp-btn:last-child { margin-right: 0; }
.cp-btn:hover { background: var(--navy-50); border-color: var(--navy); }
.cp-btn:active { transform: scale(0.97); }

.cp-btn-draft { background: var(--navy); color: #fff; border-color: var(--navy); }
.cp-btn-draft:hover { background: #252D4A; }

.cp-btn-hold { color: var(--fg4); }
.cp-btn-manual { color: var(--fg4); font-size: 11px; }
.cp-btn-manual:hover { background: var(--orange-50); border-color: var(--orange); color: var(--orange-ink); }
.cp-btn-release { background: var(--green-50); color: var(--green-ink); border-color: var(--green); }
.cp-btn-release:hover { background: #DCFCE7; }

.cp-btn-proceed { background: var(--navy); color: #fff; border-color: var(--navy); }
.cp-btn-proceed:hover { background: #252D4A; }
.cp-btn-proceed:disabled { opacity: 0.4; cursor: not-allowed; }
.cp-btn-ignore { color: var(--fg3); }
.cp-btn-cancel { color: var(--fg4); }

/* Toast */
.cp-toast {
  position: fixed;
  bottom: 24px; right: 24px;
  background: var(--navy);
  color: #fff;
  font-size: 13px; font-weight: 600;
  padding: 10px 18px;
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 9999;
  animation: cpToastIn 200ms ease-out;
}
@keyframes cpToastIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ======================================================================= */
/* MODALS                                                                    */
/* ======================================================================= */
.cp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: cpFadeIn 150ms ease-out;
}
@keyframes cpFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.cp-modal {
  background: var(--surface);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  width: 560px;
  max-width: 92vw;
  max-height: 85vh;
  overflow-y: auto;
  animation: cpModalIn 200ms cubic-bezier(0.23,1,0.32,1);
}
.cp-modal-sm { width: 400px; }
@keyframes cpModalIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.cp-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-lt);
}
.cp-modal-title { font-size: 15px; font-weight: 700; color: var(--navy); margin: 0; }
.cp-modal-x {
  border: none; background: none;
  font-size: 22px; color: var(--fg4);
  cursor: pointer; padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}
.cp-modal-x:hover { background: var(--navy-50); color: var(--fg); }

.cp-modal-content { padding: 16px 20px; }

.cp-modal-field { margin-bottom: 14px; }
.cp-modal-flabel {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--fg3);
}
.cp-modal-fvalue {
  font-size: 13px; color: var(--fg); font-weight: 600;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid var(--border-lt);
}
.cp-modal-body {
  font-family: inherit;
  font-size: 13px; color: var(--fg);
  line-height: 1.6;
  padding: 12px;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid var(--border-lt);
  white-space: pre-wrap;
  margin: 0;
}
.cp-modal-hint {
  font-size: 12px; color: var(--fg4);
  padding: 8px 12px;
  background: var(--navy-50);
  border-radius: 6px;
  margin-top: 4px;
}

.cp-btn-copy {
  font-family: inherit;
  font-size: 11px; font-weight: 600;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  background: var(--surface);
  color: var(--fg3);
  transition: background 120ms;
}
.cp-btn-copy:hover { background: var(--navy-50); color: var(--navy); }

.cp-modal-actions {
  display: flex; gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-lt);
  justify-content: flex-end;
}

/* Form fields in modals */
.cp-form-group {
  display: block;
  margin-bottom: 12px;
}
.cp-form-lbl {
  display: block;
  font-size: 12px; font-weight: 600;
  color: var(--fg3);
  margin-bottom: 4px;
}
.cp-form-input {
  width: 100%;
}
.cp-textarea {
  font-family: inherit;
  font-size: 13px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--fg);
  resize: vertical;
}
.cp-textarea:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 2px rgba(28,35,64,0.08); }

/* -- Section headers (needs action / all in progress) -- */
.cp-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--fg3);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 10px 0 6px;
  margin-top: 6px;
}
.cp-section-action { color: var(--orange-ink); }
.cp-section-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--orange);
  animation: cpPulse 2s ease-in-out infinite;
}
@keyframes cpPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.cp-section-count {
  font-size: 11px; font-weight: 700;
  background: var(--navy-50); color: var(--fg3);
  padding: 1px 7px; border-radius: 99px;
}
.cp-section-action .cp-section-count { background: var(--orange-50); color: var(--orange-ink); }
.cp-chase-action-wrap { border-color: var(--orange); border-left: 3px solid var(--orange); }

.cp-stat-action { border-left: 3px solid var(--orange); }
.cp-stat-action .cp-stat-val { color: var(--orange-ink); }

/* -- Next-flag indicator -- */
.cp-next-flag {
  font-size: 10px;
  color: var(--fg4);
  margin-top: 4px;
  line-height: 1.4;
  white-space: nowrap;
}
.cp-next-sent { color: var(--green-ink); font-weight: 600; }
.cp-next-ready { color: var(--orange-ink); }
.cp-next-ready .cp-next-sent { color: var(--green-ink); }

/* -- Certified amount input -- */
.cp-amt-input { width: 90px !important; }
.cp-amt-input::placeholder { font-size: 10px; color: var(--fg4); }

/* -- Salesperson tag -- */
.cp-salesperson-tag {
  display: inline-block;
  font-size: 10px; font-weight: 600;
  color: #7C3AED; /* purple */
  background: #F5F3FF;
  padding: 2px 7px; border-radius: 4px;
  margin-top: 3px;
}

/* -- Awareness tag (t-7 heads-up) -- */
.cp-awareness-tag {
  display: inline-block;
  font-size: 9px; font-weight: 600;
  text-transform: uppercase;
  color: var(--fg4); background: var(--navy-50);
  padding: 2px 6px; border-radius: 3px;
  margin-left: 6px;
  vertical-align: middle;
}

/* -- Variant picker (Final Reminder) -- */
.cp-variant-picker {
  display: flex; gap: 6px;
}
.cp-variant-btn {
  font-family: inherit;
  font-size: 12px; font-weight: 600;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 16px;
  cursor: pointer;
  background: var(--surface);
  color: var(--fg3);
  transition: background 120ms, border-color 120ms;
}
.cp-variant-btn:hover { border-color: var(--navy); color: var(--fg); }
.cp-variant-btn.on { background: var(--navy); color: #fff; border-color: var(--navy); }
.cp-variant-hint {
  font-size: 11px; color: var(--orange-ink);
  margin-top: 6px; font-style: italic;
}

/* -- Responsive -- */
@media (max-width: 640px) {
  .cp-root { padding: 12px; }
  .cp-header { flex-direction: column; align-items: flex-start; }
  .cp-summary { flex-direction: column; }
  .cp-portfolio { flex-direction: column; gap: 4px; }
  .cp-pf-sep { display: none; }
  .cp-chase-subtabs { width: 100%; }
  .cp-chase-subtab { flex: 1; text-align: center; }
}

/* -- Reduced motion -- */
@media (prefers-reduced-motion: reduce) {
  .cp-detail, .cp-toast, .cp-overlay, .cp-modal { animation: none; }
  .cp-tab, .cp-grid tbody tr, .cp-back, .cp-chase tbody tr, .cp-search, .cp-btn, .cp-chase-subtab { transition: none; }
}
`;
