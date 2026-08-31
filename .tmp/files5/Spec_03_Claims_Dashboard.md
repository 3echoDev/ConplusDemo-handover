# Spec #3 — Claims dashboard (F23012 pattern)

**Reference case:** F23012 — 810C Sengkang LRT Depot Extension (Sato Kogyo)
**Reference:** Claim Summary List row for F23012, screenshots #6 and #7 in the feedback thread.

---

## 3.1 Goal

The current per-project claim dashboard is missing **retention**, **certified status**, and the balance-outstanding figures the QS/Sales Admin need. Bring the dashboard in line with the row structure of the Claim Summary List so the two views agree.

---

## 3.2 Columns to display (per project, one row)

In visual order:

| # | Column | Formula | Source |
|---|---|---|---|
| 1 | Client | | `projects.client_name` |
| 2 | Project / Site | | `projects.name` |
| 3 | Project Code | | `projects.project_code` |
| 4 | Quotation Ref | | `projects.quotation_ref` |
| 5 | Liaise With | | project's assigned Sales / PIC |
| 6 | Contact No | | client contact |
| 7 | Contract Value | | `projects.contract_value` |
| 8 | **(VO) Value** | Σ `project_vos.amount` where `status = 'approved'` | join |
| 9 | **Total Contract Value** | Contract + VO | trigger-maintained `projects.total_contract_value` |
| 10 | **Value of Balance Work** | Total Contract − Amount Claimed − Retention Claimed | derived |
| 11 | (A) 95% Amount Claims | Σ `claim_lines.cum_amount` across latest claim, minus retention withheld | derived |
| 12 | (B) 5% Cumm. Retention | Σ `claims.retention_amount` to date | derived |
| 13 | (C) Certified to-date | Σ `claims.certified_amount` | derived |
| 14 | **(A)+(B)−(C) Total Outstanding** | Incl. retention | derived |
| 15 | **(D)−(B)=(E) Bal Outstanding** | Excl. retention (Amount Claimed − Certified) | derived |

Bold = new to the dashboard.

---

## 3.3 Worked example — F23012

Feed values to verify against:

- Contract Value: **$1,666,756.00**
- VO Value: **$661,877.32**
- Total Contract Value: **$2,328,633.32**
- (A) 95% Amount Claims: **$2,187,471.36**
- (B) 5% Cumm. Retention: **$115,124.75**
- (C) Certified to-date: **$2,168,224.79**

Computed:

| Field | Formula | Result |
|---|---|---|
| Value of Balance Work | 2,328,633.32 − 2,187,471.36 − 115,124.75 | **$26,037.21** ✓ |
| Total Outstanding (Incl. Retention) | 2,187,471.36 + 115,124.75 − 2,168,224.79 | **$134,371.32** ✓ |
| Bal Outstanding (Excl. Retention) | 2,187,471.36 − 2,168,224.79 | **$19,246.57** ✓ |

All three tie to the user's expected figures — implement the formulas exactly as above.

---

## 3.4 Per-claim breakdown table (existing dashboard, add Certified Status)

The existing per-claim table (screenshot #7 — the F23012 breakdown listing claims #10 through #23) is good. Add these columns:

| Column | Source |
|---|---|
| Claim No | `claims.claim_number` |
| Claim Date | `claims.claim_date` |
| Total Claim | Σ `claim_lines.curr_amount` (period) |
| **Retention Amount** | `claims.retention_amount` |
| Claim Amount | net of retention |
| **Certified Amount** | `claims.certified_amount` |
| **Balance (+Retention)** | Claim Amount + Retention − Certified |
| **Balance** | Claim Amount − Certified |
| **Certified Status** | `claims.status` — one of `submitted`, `certified`, `pending`, `rejected` — badge-styled |
| Remarks | free text |

The **Certified Status** column is what's missing today. Style as a coloured pill:
- `certified` — green
- `submitted` — amber ("pending certification")
- `pending` — grey
- `rejected` — red

---

## 3.5 Retention rules recap (must be honoured)

Per the ops skill:

```
retention_withheld = min(
  work_done × projects.retention_pct%,
  projects.contract_value × projects.retention_cap_pct%
)
```

Default `retention_pct = 10`, `retention_cap_pct = 5`. **The cap wins** on large cumulative claims. Do not withhold a flat 10% without checking the cap — the dashboard's (B) column must respect this.

Confirm each project's `retention_pct` / `retention_cap_pct` is set correctly before relying on the dashboard's (B) figure; per the skill, terms defaulted in during migration and may need adjusting per contract.

---

## 3.6 Data source note

`v_project_claims` was removed. Sum from `claims` + `claim_lines` directly. The dashboard row query should be one CTE per project — small tables, single round-trip is fine.

---

## Acceptance
- [ ] Open F23012's dashboard; the six input values match the reference row and the three computed values tie exactly.
- [ ] The per-claim breakdown table shows a Certified Status pill on every row.
- [ ] Retention column reflects the capped figure, not a raw 10%, on projects where the cap binds.
- [ ] A project with no VOs still renders (VO Value = $0, Total Contract = Contract).
- [ ] A project with no claims yet renders zero-value figures and Balance = Total Contract.
