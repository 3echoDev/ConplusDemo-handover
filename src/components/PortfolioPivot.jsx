import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

/*
  ConPlus — Management Summary Pivot (by Sales Manager)
  -----------------------------------------------------
  Reads `project_claim_summary` view only. Groups by sales_manager with
  multi-select filters for billing_status, client_name, sales_manager.

  balance_of_work is suppressed for Clear/Complete projects (unreliable —
  certified amounts for older claims aren't fully loaded).
  NULL billing_status shown as "(Unclassified)" so nothing silently vanishes.
*/

// Statuses where balance_of_work is meaningful
const BOW_VALID_STATUSES = new Set(["WIP", "Final Claim"]);

// ---- helpers ---------------------------------------------------------------
const fmt = (n) =>
  n == null
    ? "\u2014"
    : n.toLocaleString("en-SG", {
        style: "currency",
        currency: "SGD",
        maximumFractionDigits: 0,
      });

function cleanStr(s) {
  if (!s) return "";
  return s.split("\n")[0].replace(/\*.*?\*/g, "").trim();
}

// ============================================================================
// MULTI-SELECT DROPDOWN
// ============================================================================
function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.length === options.length;
  const noneSelected = selected.length === 0;

  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const displayLabel =
    allSelected || noneSelected
      ? `All ${label}`
      : selected.length === 1
      ? selected[0]
      : `${selected.length} ${label}`;

  return (
    <div className="pp-multi" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button className="pp-multi-btn" onClick={() => setOpen(!open)} type="button">
        {displayLabel}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="pp-multi-drop" tabIndex={-1}>
          <button
            className="pp-multi-item pp-multi-all"
            onClick={() => onChange(allSelected ? [] : [...options])}
            type="button"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          {options.map((opt) => (
            <label key={opt} className="pp-multi-item">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PortfolioPivot() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Filters — arrays (multi-select). Empty = all.
  const [statusFilter, setStatusFilter] = useState([]);
  const [clientFilter, setClientFilter] = useState([]);
  const [managerFilter, setManagerFilter] = useState([]);
  const [defaultApplied, setDefaultApplied] = useState(false);

  // Sort
  const [sortCol, setSortCol] = useState("contract");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("project_claim_summary")
          .select(
            "sales_manager, billing_status, client_name, project_code, project_name, billable_contract, total_certified, balance_of_work, to_claim, claim_count"
          );
        if (error) throw error;

        const cleaned = (data || []).map((r) => ({
          ...r,
          sales_manager: cleanStr(r.sales_manager) || "(Unassigned)",
          billing_status: r.billing_status ? cleanStr(r.billing_status) : "(Unclassified)",
          client_name: cleanStr(r.client_name) || "(Unknown)",
          billable_contract: r.billable_contract == null ? 0 : Number(r.billable_contract),
          total_certified: r.total_certified == null ? 0 : Number(r.total_certified),
          balance_of_work: r.balance_of_work == null ? null : Number(r.balance_of_work),
          to_claim: r.to_claim == null ? null : Number(r.to_claim),
          claim_count: r.claim_count == null ? 0 : Number(r.claim_count),
        }));
        setRows(cleaned);
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Derive filter options from data
  const allStatuses = useMemo(() => {
    const set = new Set(rows.map((r) => r.billing_status));
    return [...set].sort((a, b) => {
      if (a === "(Unclassified)") return 1;
      if (b === "(Unclassified)") return -1;
      return a.localeCompare(b);
    });
  }, [rows]);

  const allClients = useMemo(() => {
    const set = new Set(rows.map((r) => r.client_name));
    return [...set].sort();
  }, [rows]);

  const allManagers = useMemo(() => {
    const set = new Set(rows.map((r) => r.sales_manager));
    return [...set].sort((a, b) => {
      if (a === "(Unassigned)") return 1;
      if (b === "(Unassigned)") return -1;
      return a.localeCompare(b);
    });
  }, [rows]);

  // Apply default WIP filter once data loads
  useEffect(() => {
    if (!defaultApplied && allStatuses.length > 0) {
      if (allStatuses.includes("WIP")) {
        setStatusFilter(["WIP"]);
      }
      setDefaultApplied(true);
    }
  }, [allStatuses, defaultApplied]);

  // Filter rows
  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter.length > 0) out = out.filter((r) => statusFilter.includes(r.billing_status));
    if (clientFilter.length > 0) out = out.filter((r) => clientFilter.includes(r.client_name));
    if (managerFilter.length > 0) out = out.filter((r) => managerFilter.includes(r.sales_manager));
    return out;
  }, [rows, statusFilter, clientFilter, managerFilter]);

  // Group by manager
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const mgr = r.sales_manager;
      if (!map.has(mgr)) {
        map.set(mgr, { manager: mgr, projects: [], count: 0, contract: 0, bow: 0, bowValid: true });
      }
      const g = map.get(mgr);
      g.projects.push(r);
      g.count++;
      g.contract += r.billable_contract;
      if (BOW_VALID_STATUSES.has(r.billing_status)) {
        g.bow += r.balance_of_work ?? 0;
      }
    }

    // Check if any row in the group has an invalid-BOW status
    for (const g of map.values()) {
      const hasInvalid = g.projects.some((p) => !BOW_VALID_STATUSES.has(p.billing_status));
      // BOW column shows the sum of only WIP/Final Claim rows
      // If ALL projects are non-BOW-valid statuses, mark bowValid false so we show "—"
      const hasValid = g.projects.some((p) => BOW_VALID_STATUSES.has(p.billing_status));
      g.bowValid = hasValid;
    }

    let arr = [...map.values()];

    // Sort
    arr.sort((a, b) => {
      let va, vb;
      if (sortCol === "manager") { va = a.manager; vb = b.manager; }
      else if (sortCol === "count") { va = a.count; vb = b.count; }
      else if (sortCol === "contract") { va = a.contract; vb = b.contract; }
      else if (sortCol === "bow") { va = a.bow; vb = b.bow; }
      else { va = a.contract; vb = b.contract; }

      if (typeof va === "string") {
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortAsc ? va - vb : vb - va;
    });

    return arr;
  }, [filtered, sortCol, sortAsc]);

  // Grand total
  const grand = useMemo(() => {
    let count = 0, contract = 0, bow = 0, bowHasValid = false;
    for (const g of groups) {
      count += g.count;
      contract += g.contract;
      bow += g.bow;
      if (g.bowValid) bowHasValid = true;
    }
    return { count, contract, bow, bowValid: bowHasValid };
  }, [groups]);

  // Status summary for the filter indicator
  const statusSummary = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const s = r.billing_status;
      if (!map.has(s)) map.set(s, { status: s, count: 0, contract: 0 });
      const g = map.get(s);
      g.count++;
      g.contract += r.billable_contract;
    }
    return [...map.values()].sort((a, b) => b.contract - a.contract);
  }, [rows]);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col === "manager"); }
  };

  const sortIcon = (col) => {
    if (sortCol !== col) return null;
    return sortAsc ? " \u25B2" : " \u25BC";
  };

  // Expanded manager row
  const [expanded, setExpanded] = useState(null);

  if (loading) return <Shell><div className="pp-loading">Loading portfolio data\u2026</div></Shell>;
  if (err)
    return (
      <Shell>
        <div className="pp-error">
          <strong>Couldn't load portfolio data.</strong> {err}
          <div className="pp-error-hint">Check the Supabase connection and that the anon key has read access to project_claim_summary.</div>
        </div>
      </Shell>
    );

  // Determine if we're filtering to only BOW-valid statuses
  const showingOnlyBowValid =
    statusFilter.length > 0 && statusFilter.every((s) => BOW_VALID_STATUSES.has(s));

  return (
    <Shell>
      {/* ── Header ── */}
      <header className="pp-header">
        <div className="pp-header-left">
          <a href="/" className="pp-back" title="Back to Live Operations">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </a>
          <span className="pp-title">Management Summary</span>
          <span className="pp-stats">
            {grand.count} project{grand.count !== 1 ? "s" : ""} &middot; {fmt(grand.contract)}
          </span>
        </div>
      </header>

      {/* ── Filters ── */}
      <div className="pp-controls">
        <MultiSelect
          label="statuses"
          options={allStatuses}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
        <MultiSelect
          label="clients"
          options={allClients}
          selected={clientFilter}
          onChange={setClientFilter}
        />
        <MultiSelect
          label="managers"
          options={allManagers}
          selected={managerFilter}
          onChange={setManagerFilter}
        />
        {statusFilter.length > 0 && (
          <button className="pp-clear-btn" onClick={() => { setStatusFilter([]); setClientFilter([]); setManagerFilter([]); }} type="button">
            Clear filters
          </button>
        )}
      </div>

      {/* ── Active filter indicator ── */}
      {statusFilter.length > 0 && statusFilter.length < allStatuses.length && (
        <div className="pp-filter-indicator">
          Showing: {statusFilter.join(", ")}
        </div>
      )}

      {/* ── Table ── */}
      <div className="pp-grid-wrap">
        <table className="pp-grid">
          <thead>
            <tr>
              <th className="pp-th-mgr" onClick={() => handleSort("manager")} style={{ cursor: "pointer" }}>
                Sales Manager{sortIcon("manager")}
              </th>
              <th className="pp-th-num" onClick={() => handleSort("count")} style={{ cursor: "pointer" }}>
                Projects{sortIcon("count")}
              </th>
              <th className="pp-th-num" onClick={() => handleSort("contract")} style={{ cursor: "pointer" }}>
                Contract Value{sortIcon("contract")}
              </th>
              <th className="pp-th-num" onClick={() => handleSort("bow")} style={{ cursor: "pointer" }}>
                Balance of Work{sortIcon("bow")}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td colSpan={4} className="pp-empty">No projects match the current filters.</td></tr>
            )}
            {groups.map((g) => (
              <React.Fragment key={g.manager}>
                <tr
                  className={expanded === g.manager ? "pp-row-open" : ""}
                  onClick={() => setExpanded(expanded === g.manager ? null : g.manager)}
                >
                  <td className="pp-col-mgr">{g.manager}</td>
                  <td className="pp-col-num">{g.count}</td>
                  <td className="pp-col-num">{fmt(g.contract)}</td>
                  <td className="pp-col-num pp-col-bow">
                    {g.bowValid ? fmt(g.bow) : "\u2014"}
                  </td>
                </tr>
                {expanded === g.manager && (
                  <tr className="pp-detail-row">
                    <td colSpan={4}>
                      <div className="pp-detail">
                        <table className="pp-dtable">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Project</th>
                              <th>Client</th>
                              <th>Status</th>
                              <th className="r">Contract</th>
                              <th className="r">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.projects
                              .slice()
                              .sort((a, b) => b.billable_contract - a.billable_contract)
                              .map((p) => (
                                <tr key={p.project_code}>
                                  <td className="pp-d-code">{p.project_code}</td>
                                  <td className="pp-d-name" title={p.project_name}>{cleanStr(p.project_name)}</td>
                                  <td className="pp-d-client">{p.client_name}</td>
                                  <td>
                                    <span className={`pp-pill pp-pill-${p.billing_status === "WIP" ? "wip" : p.billing_status === "Final Claim" ? "final" : p.billing_status === "Clear" ? "clear" : p.billing_status === "Complete" ? "complete" : "other"}`}>
                                      {p.billing_status}
                                    </span>
                                  </td>
                                  <td className="r">{fmt(p.billable_contract)}</td>
                                  <td className="r">
                                    {BOW_VALID_STATUSES.has(p.billing_status)
                                      ? fmt(p.balance_of_work ?? 0)
                                      : "\u2014"}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="pp-grand">
              <td className="pp-col-mgr pp-grand-label">Grand Total</td>
              <td className="pp-col-num">{grand.count}</td>
              <td className="pp-col-num">{fmt(grand.contract)}</td>
              <td className="pp-col-num pp-col-bow">
                {grand.bowValid ? fmt(grand.bow) : "\u2014"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── BOW caveat note ── */}
      {!showingOnlyBowValid && (
        <div className="pp-note">
          Balance of work shown for WIP and Final Claim projects only. Clear/Complete projects show "\u2014" because certified amounts for older claims are not fully loaded.
        </div>
      )}
    </Shell>
  );
}

// ============================================================================
// SHELL — provides scoped CSS
// ============================================================================
function Shell({ children }) {
  return (
    <div className="pp-root">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

const CSS = `
/* ── Tokens ── */
.pp-root {
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
.pp-root *, .pp-root *::before, .pp-root *::after { box-sizing: border-box; }

/* ── States ── */
.pp-loading, .pp-empty { padding: 48px; text-align: center; color: var(--fg3); font-size: 14px; }
.pp-error { padding: 20px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--radius); color: #991B1B; font-size: 13px; }
.pp-error-hint { margin-top: 6px; font-size: 12px; color: var(--fg3); }

/* ── Header ── */
.pp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.pp-header-left { display: flex; align-items: center; gap: 10px; }
.pp-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border-radius: 6px;
  color: var(--fg3);
  text-decoration: none;
  transition: background 150ms ease-out, color 150ms ease-out;
}
.pp-back:hover { background: var(--navy-50); color: var(--fg); }
.pp-title { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; color: var(--navy); }
.pp-stats { font-size: 12px; color: var(--fg3); }

/* ── Controls ── */
.pp-controls { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: flex-start; }
.pp-clear-btn {
  font-family: inherit; font-size: 12px; font-weight: 600;
  color: var(--fg3); background: none; border: 1px solid var(--border);
  border-radius: var(--radius); padding: 7px 12px; cursor: pointer;
  transition: background 150ms ease-out;
}
.pp-clear-btn:hover { background: var(--navy-50); }

/* ── Multi-select ── */
.pp-multi { position: relative; }
.pp-multi-btn {
  font-family: inherit; font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  white-space: nowrap;
  min-width: 120px;
  transition: border-color 150ms ease-out;
}
.pp-multi-btn:hover { border-color: var(--navy); }
.pp-multi-drop {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 200px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  z-index: 20;
  padding: 4px;
}
.pp-multi-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; padding: 6px 8px;
  border-radius: 4px; cursor: pointer;
  border: none; background: none; width: 100%;
  font-family: inherit; color: var(--fg);
  text-align: left;
}
.pp-multi-item:hover { background: var(--navy-50); }
.pp-multi-all { font-weight: 600; color: var(--navy); border-bottom: 1px solid var(--border-lt); margin-bottom: 2px; border-radius: 4px 4px 0 0; }
.pp-multi-item input[type="checkbox"] { accent-color: var(--navy); }

/* ── Filter indicator ── */
.pp-filter-indicator {
  font-size: 12px; color: var(--fg3); margin-bottom: 10px;
  padding: 6px 12px; background: var(--navy-50); border-radius: var(--radius);
  font-weight: 500;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* TABLE                                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */
.pp-grid-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
}
.pp-grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.pp-grid thead th {
  position: sticky; top: 0;
  background: var(--bg);
  font-weight: 600; font-size: 10px;
  color: var(--fg3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 10px 14px;
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--border);
  z-index: 2;
  user-select: none;
}
.pp-th-mgr { text-align: left !important; min-width: 160px; }
.pp-th-num { min-width: 120px; }

/* Rows */
.pp-grid tbody tr { cursor: pointer; transition: background 120ms ease-out; }
.pp-grid tbody tr:hover { background: var(--navy-50); }
.pp-row-open { background: var(--navy-50) !important; }

.pp-grid td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-lt);
  vertical-align: middle;
  font-variant-numeric: tabular-nums;
}
.pp-col-mgr {
  text-align: left;
  font-weight: 700;
  color: var(--navy);
  font-size: 14px;
}
.pp-col-num {
  text-align: right;
  font-weight: 700;
}
.pp-col-bow { color: var(--fg2); }

/* Grand total */
.pp-grand {
  cursor: default !important;
}
.pp-grand td {
  border-top: 2px solid var(--navy);
  border-bottom: none;
  font-weight: 800 !important;
  font-size: 14px;
  background: var(--navy-50);
  padding: 12px 14px;
}
.pp-grand-label {
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 12px !important;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* DETAIL (expanded manager row)                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */
.pp-detail-row td {
  background: var(--bg) !important;
  padding: 0 !important;
  cursor: default !important;
}
.pp-detail {
  padding: 12px 16px 14px;
  animation: ppDetailIn 200ms cubic-bezier(0.23,1,0.32,1);
}
@keyframes ppDetailIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.pp-dtable { width: 100%; border-collapse: collapse; font-size: 13px; }
.pp-dtable th {
  position: static; background: none;
  text-align: left; font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--fg4); padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}
.pp-dtable th.r { text-align: right; }
.pp-dtable td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-lt);
  font-variant-numeric: tabular-nums;
}
.pp-dtable td.r { text-align: right; font-weight: 700; }

.pp-d-code { font-weight: 700; color: var(--navy); white-space: nowrap; }
.pp-d-name { color: var(--fg2); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-d-client { color: var(--fg3); font-size: 12px; }

/* Status pills */
.pp-pill {
  display: inline-block; font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.02em;
  padding: 2px 7px; border-radius: 99px;
  white-space: nowrap;
}
.pp-pill-wip { background: var(--orange-50); color: var(--orange-ink); }
.pp-pill-final { background: #EFF6FF; color: #1E40AF; }
.pp-pill-clear { background: var(--green-50); color: var(--green-ink); }
.pp-pill-complete { background: var(--navy-50); color: var(--navy); }
.pp-pill-other { background: #F3F4F6; color: var(--fg3); }

/* ── Note ── */
.pp-note {
  margin-top: 10px;
  font-size: 12px;
  color: var(--fg4);
  padding: 8px 12px;
  background: var(--surface);
  border: 1px solid var(--border-lt);
  border-radius: var(--radius);
  line-height: 1.5;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .pp-root { padding: 12px; }
  .pp-header { flex-direction: column; align-items: flex-start; }
  .pp-controls { flex-direction: column; }
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .pp-detail { animation: none; }
  .pp-grid tbody tr, .pp-back, .pp-clear-btn, .pp-multi-btn { transition: none; }
}
`;
