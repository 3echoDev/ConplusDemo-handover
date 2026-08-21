import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/*
  ConPlus — Claims Pivot & Payment Chase
  ---------------------------------------
  Reimagines the "Prog Claims" spreadsheet: projects down the side, months across,
  claim / certified / outstanding in the cells. Plus the thing accounts actually
  needs — a T+30 chase view that surfaces which projects have payment due.

  Drop-in: expects a configured Supabase client. Reads `claims` joined to `projects`.
  Palette matches the ConPlus identity (navy #1C2340 / orange #F7901E).
*/

// ---- Supabase (swap to anon key + RLS before public deploy) -----------------
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || "https://ethxxhlpmfpnuaxeyshy.supabase.co";
const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- helpers ---------------------------------------------------------------
const fmt = (n) =>
  n == null ? "—" : n.toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });
const fmtFull = (n) =>
  n == null ? "—" : n.toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });

const monthKey = (d) => d.slice(0, 7); // "2025-03-01" -> "2025-03"
const monthLabel = (key) => {
  const [y, m] = key.split("-");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1];
  return `${mon}'${y.slice(2)}`;
};

// days since a claim was submitted (for T+30). Certified-but-unpaid is the chase target.
const daysSince = (dateStr) => {
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
};

export default function ClaimsPivot() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [view, setView] = useState("pivot"); // "pivot" | "chase"
  const [managerFilter, setManagerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("claims")
          .select(
            "claim_no, claim_date, amount, certified_amount, status, contact_person, contact_number, " +
              "projects!inner(project_code, name, client_name, contract_value, total_contract_value, sales_manager, status, work_type_code)"
          )
          .order("claim_date", { ascending: true });
        if (error) throw error;
        const flat = (data || []).map((c) => ({
          claim_no: c.claim_no,
          claim_date: c.claim_date,
          amount: c.amount == null ? null : Number(c.amount),
          certified: c.certified_amount == null ? null : Number(c.certified_amount),
          status: c.status,
          contact: c.projects?.contact_person || c.contact_person,
          phone: c.projects?.contact_number || c.contact_number,
          code: c.projects?.project_code,
          name: c.projects?.name,
          client: c.projects?.client_name,
          contract: c.projects?.total_contract_value || c.projects?.contract_value,
          manager: c.projects?.sales_manager,
        }));
        setRows(flat);
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // distinct months across the data, in order
  const months = useMemo(() => {
    const set = new Set(rows.map((r) => monthKey(r.claim_date)));
    return [...set].sort();
  }, [rows]);

  const managers = useMemo(() => {
    const set = new Set(rows.map((r) => r.manager).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  // group into per-project rows with a month->claim map
  const projects = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.code)) {
        map.set(r.code, {
          code: r.code,
          name: r.name,
          client: r.client,
          contract: r.contract,
          manager: r.manager,
          cells: {},
          claims: [],
          totalClaimed: 0,
          totalCertified: 0,
        });
      }
      const p = map.get(r.code);
      const mk = monthKey(r.claim_date);
      p.cells[mk] = r; // last claim of the month wins the cell
      p.claims.push(r);
      p.totalClaimed += r.amount || 0;
      p.totalCertified += r.certified || 0;
    }
    let arr = [...map.values()];
    // filters
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
    // sort by most recent claim desc
    arr.sort((a, b) => {
      const la = a.claims[a.claims.length - 1]?.claim_date || "";
      const lb = b.claims[b.claims.length - 1]?.claim_date || "";
      return lb.localeCompare(la);
    });
    return arr;
  }, [rows, managerFilter, statusFilter, search]);

  // T+30 chase list: certified claims (accounts is owed) whose age >= 30 days,
  // plus submitted claims still awaiting certification. What Chloe hunts for today.
  const chase = useMemo(() => {
    const items = [];
    for (const r of rows) {
      const age = daysSince(r.claim_date);
      if (r.status === "certified" && r.certified > 0 && age >= 30) {
        items.push({ ...r, kind: "payment_due", age });
      } else if (r.status === "submitted" && age >= 30) {
        items.push({ ...r, kind: "awaiting_cert", age });
      }
    }
    items.sort((a, b) => b.age - a.age);
    return items;
  }, [rows]);

  if (loading) return <Shell><div className="cp-loading">Loading claims…</div></Shell>;
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
      <header className="cp-head">
        <div>
          <p className="cp-eyebrow">Progress claims</p>
          <h1 className="cp-title">Claims &amp; payment chase</h1>
          <p className="cp-sub">
            {projects.length} projects · {rows.length} claims · {months.length} months
          </p>
        </div>
        <div className="cp-tabs">
          <button className={view === "pivot" ? "on" : ""} onClick={() => setView("pivot")}>
            Claims grid
          </button>
          <button className={view === "chase" ? "on" : ""} onClick={() => setView("chase")}>
            Payment chase
            {chase.length > 0 && <span className="cp-badge">{chase.length}</span>}
          </button>
        </div>
      </header>

      {view === "chase" && (
        <div className="cp-chase-summary">
          <div className="cp-stat">
            <span className="cp-stat-num">{fmt(totalOutstanding)}</span>
            <span className="cp-stat-lbl">certified &amp; ageing (30+ days)</span>
          </div>
          <div className="cp-stat">
            <span className="cp-stat-num">{awaitingCount}</span>
            <span className="cp-stat-lbl">submitted, awaiting certification</span>
          </div>
        </div>
      )}

      <div className="cp-controls">
        <input
          className="cp-search"
          placeholder="Search project, code, or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
          <option value="all">All managers</option>
          {managers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {view === "pivot" && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All projects</option>
            <option value="outstanding">Has outstanding</option>
          </select>
        )}
      </div>

      {view === "pivot" ? (
        <PivotGrid
          projects={projects}
          months={months}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      ) : (
        <ChaseList items={chase} />
      )}
    </Shell>
  );
}

// ---- the pivot grid --------------------------------------------------------
function PivotGrid({ projects, months, expanded, setExpanded }) {
  if (projects.length === 0)
    return <div className="cp-empty">No projects match. Clear the filters to see everything.</div>;

  return (
    <div className="cp-grid-wrap">
      <table className="cp-grid">
        <thead>
          <tr>
            <th className="cp-sticky cp-col-proj">Project</th>
            <th className="cp-col-contract">Contract</th>
            {months.map((m) => (
              <th key={m} className="cp-col-month">
                {monthLabel(m)}
              </th>
            ))}
            <th className="cp-col-total">Claimed</th>
            <th className="cp-col-total">Certified</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const isOpen = expanded === p.code;
            const outstanding = p.totalClaimed - p.totalCertified;
            return (
              <React.Fragment key={p.code}>
                <tr className={isOpen ? "cp-row-open" : ""} onClick={() => setExpanded(isOpen ? null : p.code)}>
                  <td className="cp-sticky cp-col-proj">
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
                  <td className="cp-col-total cp-cert">
                    {fmt(p.totalCertified)}
                    {outstanding > 1 && <span className="cp-out">▲ {compact(outstanding)}</span>}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="cp-detail-row">
                    <td className="cp-sticky" colSpan={1}></td>
                    <td colSpan={months.length + 3}>
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

// ---- expanded per-project claim history ------------------------------------
function ClaimDetail({ project }) {
  return (
    <div className="cp-detail">
      <div className="cp-detail-head">
        <div>
          <strong>{project.code}</strong> — {cleanName(project.name)}
        </div>
        <div className="cp-detail-contact">
          {project.claims[0]?.contact && <span>{project.claims[0].contact}</span>}
          {project.claims[0]?.phone && <span className="cp-phone">{project.claims[0].phone}</span>}
        </div>
      </div>
      <table className="cp-detail-table">
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
                <td className={`r ${variance < 0 ? "cp-neg" : variance > 0 ? "cp-pos" : ""}`}>
                  {variance == null ? "—" : (variance >= 0 ? "+" : "") + fmtFull(variance)}
                </td>
                <td>
                  <span className={`cp-pill cp-pill-${c.status}`}>{c.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- the T+30 chase list ---------------------------------------------------
function ChaseList({ items }) {
  if (items.length === 0)
    return <div className="cp-empty">Nothing to chase — no claims are 30+ days old and unpaid.</div>;

  return (
    <div className="cp-chase">
      {items.map((c, i) => (
        <div key={i} className={`cp-chase-card cp-chase-${c.kind}`}>
          <div className="cp-chase-main">
            <div className="cp-chase-proj">
              <span className="cp-code">{c.code}</span>
              <span className="cp-pname">{cleanName(c.name)}</span>
            </div>
            <div className="cp-chase-meta">
              <span className="cp-chase-client">{cleanClient(c.client)}</span>
              {c.contact && <span className="cp-chase-contact">{c.contact}</span>}
              {c.phone && <span className="cp-phone">{c.phone}</span>}
            </div>
          </div>
          <div className="cp-chase-fig">
            <span className="cp-chase-amt">{fmtFull(c.kind === "payment_due" ? c.certified : c.amount)}</span>
            <span className="cp-chase-tag">
              {c.kind === "payment_due" ? (
                <>Claim #{c.claim_no} · certified {c.age}d ago</>
              ) : (
                <>Claim #{c.claim_no} · submitted {c.age}d ago, not yet certified</>
              )}
            </span>
          </div>
          <div className="cp-chase-action">
            <span className={`cp-chase-flag cp-flag-${c.kind}`}>
              {c.kind === "payment_due" ? "Chase payment" : "Chase certification"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- small utilities -------------------------------------------------------
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
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return Math.round(n).toString();
}
function cellTitle(c) {
  return `Claim #${c.claim_no ?? "—"} · ${c.status}\nClaimed ${fmtFull(c.amount)}\nCertified ${
    c.certified == null ? "pending" : fmtFull(c.certified)
  }`;
}

// ---- shell + styles --------------------------------------------------------
function Shell({ children }) {
  return (
    <div className="cp-root">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

const CSS = `
.cp-root{
  --navy:#1C2340; --navy-700:#2A3358; --orange:#F7901E; --orange-ink:#B45E00;
  --orange-50:#FFF6EA; --border:#E3E6F0; --bg:#F7F8FC; --fg:#141A31; --sub:#6B7391;
  --good:#1FA855; --warn:#B45E00; --bad:#C0342B;
  font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;
  color:var(--fg); background:var(--bg); padding:24px; min-height:100vh;
}
.cp-root *{box-sizing:border-box}
.cp-loading,.cp-empty{padding:60px;text-align:center;color:var(--sub);font-size:15px}
.cp-error{padding:24px;background:#FDF3F2;border:1px solid #F3D5D2;border-radius:12px;color:#8E2A22}
.cp-error-hint{margin-top:8px;font-size:13px;color:var(--sub)}

.cp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:20px;flex-wrap:wrap}
.cp-eyebrow{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--orange-ink);margin:0 0 4px}
.cp-title{margin:0;font-size:26px;font-weight:800;letter-spacing:-.02em}
.cp-sub{margin:6px 0 0;color:var(--sub);font-size:14px}

.cp-tabs{display:flex;gap:6px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:4px}
.cp-tabs button{position:relative;border:none;background:none;font-family:inherit;font-size:14px;font-weight:600;color:var(--sub);padding:8px 16px;border-radius:9px;cursor:pointer;transition:all .15s}
.cp-tabs button:hover{color:var(--fg)}
.cp-tabs button.on{background:var(--navy);color:#fff}
.cp-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:7px;font-size:11px;font-weight:700;background:var(--orange);color:#fff;border-radius:999px}
.cp-tabs button.on .cp-badge{background:#fff;color:var(--navy)}

.cp-chase-summary{display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.cp-stat{background:#fff;border:1px solid var(--border);border-left:3px solid var(--orange);border-radius:12px;padding:16px 20px;min-width:200px}
.cp-stat-num{display:block;font-size:24px;font-weight:800;letter-spacing:-.02em}
.cp-stat-lbl{display:block;font-size:12px;color:var(--sub);margin-top:2px}

.cp-controls{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.cp-search{flex:1;min-width:220px;font-family:inherit;font-size:14px;padding:9px 13px;border:1px solid var(--border);border-radius:9px;background:#fff}
.cp-search:focus{outline:none;border-color:var(--orange);box-shadow:0 0 0 3px rgba(247,144,30,.15)}
.cp-controls select{font-family:inherit;font-size:14px;padding:9px 13px;border:1px solid var(--border);border-radius:9px;background:#fff;cursor:pointer}

/* pivot grid */
.cp-grid-wrap{overflow-x:auto;background:#fff;border:1px solid var(--border);border-radius:12px}
.cp-grid{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
.cp-grid th{position:sticky;top:0;background:var(--navy);color:#fff;font-weight:600;font-size:11px;letter-spacing:.02em;padding:10px 8px;text-align:right;white-space:nowrap;z-index:2}
.cp-grid th.cp-col-proj{text-align:left}
.cp-col-month{min-width:64px}
.cp-col-contract,.cp-col-total{min-width:82px}
.cp-sticky{position:sticky;left:0;z-index:1}
.cp-col-proj{min-width:230px;max-width:230px}
th.cp-col-proj{z-index:3}
.cp-grid td{padding:8px;border-bottom:1px solid var(--border);text-align:right;vertical-align:top}
.cp-grid tbody tr{cursor:pointer;transition:background .12s}
.cp-grid tbody tr:hover{background:var(--orange-50)}
.cp-row-open{background:var(--orange-50)}
td.cp-col-proj{background:#fff;text-align:left;border-right:1px solid var(--border)}
.cp-grid tbody tr:hover td.cp-col-proj{background:var(--orange-50)}
.cp-row-open td.cp-col-proj{background:var(--orange-50)}
.cp-code{display:block;font-weight:700;font-size:13px;color:var(--navy)}
.cp-pname{display:block;font-size:12px;color:var(--fg);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px}
.cp-client{display:block;font-size:11px;color:var(--sub);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px}

.cp-cell{position:relative}
.cp-cell-empty{background:repeating-linear-gradient(45deg,transparent,transparent 6px,#fafbfd 6px,#fafbfd 7px)}
.cp-cell-amt{display:block;font-weight:600;font-variant-numeric:tabular-nums}
.cp-cell-no{display:block;font-size:10px;color:var(--sub);margin-top:1px}
.cp-cell-certified .cp-cell-amt{color:var(--good)}
.cp-cell-submitted{background:var(--orange-50)}
.cp-cell-submitted .cp-cell-amt{color:var(--orange-ink)}

.cp-col-total{font-weight:700;font-variant-numeric:tabular-nums;background:#FCFDFE}
.cp-cert{color:var(--navy)}
.cp-out{display:block;font-size:10px;color:var(--orange-ink);font-weight:600;margin-top:1px}

/* detail */
.cp-detail-row td{background:#FCFDFE;padding:0}
.cp-detail{padding:16px 20px}
.cp-detail-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;flex-wrap:wrap;gap:8px}
.cp-detail-head strong{color:var(--navy)}
.cp-detail-contact{font-size:12px;color:var(--sub);display:flex;gap:12px}
.cp-phone{color:var(--orange-ink);font-weight:600}
.cp-detail-table{width:100%;border-collapse:collapse;font-size:12px}
.cp-detail-table th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--sub);padding:4px 8px;border-bottom:1px solid var(--border)}
.cp-detail-table th.r,.cp-detail-table td.r{text-align:right;font-variant-numeric:tabular-nums}
.cp-detail-table td{padding:5px 8px;border-bottom:1px solid #EEF0F7}
.cp-pending{color:var(--orange-ink);font-style:italic}
.cp-neg{color:var(--bad)}
.cp-pos{color:var(--good)}
.cp-pill{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:999px}
.cp-pill-certified{background:#E7F6EE;color:#137a44}
.cp-pill-submitted{background:var(--orange-50);color:var(--orange-ink)}

/* chase */
.cp-chase{display:flex;flex-direction:column;gap:8px}
.cp-chase-card{display:flex;align-items:center;gap:16px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 18px}
.cp-chase-payment_due{border-left:3px solid var(--orange)}
.cp-chase-awaiting_cert{border-left:3px solid var(--navy)}
.cp-chase-main{flex:1;min-width:0}
.cp-chase-proj{display:flex;align-items:baseline;gap:10px}
.cp-chase-proj .cp-code{display:inline}
.cp-chase-proj .cp-pname{display:inline;max-width:none}
.cp-chase-meta{display:flex;gap:12px;margin-top:3px;font-size:12px;color:var(--sub);flex-wrap:wrap}
.cp-chase-fig{text-align:right;white-space:nowrap}
.cp-chase-amt{display:block;font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}
.cp-chase-tag{display:block;font-size:11px;color:var(--sub);margin-top:1px}
.cp-chase-flag{font-size:11px;font-weight:700;padding:6px 12px;border-radius:999px;white-space:nowrap}
.cp-flag-payment_due{background:var(--orange-50);color:var(--orange-ink)}
.cp-flag-awaiting_cert{background:var(--navy);color:#fff}

@media (max-width:640px){
  .cp-root{padding:14px}
  .cp-chase-card{flex-direction:column;align-items:flex-start;gap:8px}
  .cp-chase-fig{text-align:left}
}
`;
