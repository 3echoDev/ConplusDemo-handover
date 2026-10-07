// Invoice stage (Accounts' spec, 21 + 24 Sep 2026): preview Quotation | Progress Claim |
// Invoice side by side, edit the invoice lines, check the figures against the
// certificate, then issue. Issuing (issue_claim_invoice) stamps the invoice date and
// status 'invoiced', which starts the Payment chase.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  buildInvoiceDraft,
  buildRetentionSchedule,
  computeInvoiceTotals,
  defaultRetention,
  relabelItems,
  retentionLabel,
  round2,
  spellAmount,
  tallyWithCertificate,
  invoiceNumberFor,
} from "@/lib/invoiceDocument";
import { exportInvoiceToExcel, printInvoice } from "@/lib/invoiceExcel";

const money = (n) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });
const numOrNull = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
};
const actorName = () => { try { return localStorage.getItem("conplus_store_approver") || null; } catch { return null; } };

const S = {
  modal: { width: 1240, maxWidth: "96vw", maxHeight: "92vh" },
  grid: { display: "grid", gridTemplateColumns: "minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,1.4fr)", gap: 14 },
  col: { border: "1px solid var(--border-lt)", borderRadius: 10, padding: 12, background: "var(--bg)", minWidth: 0 },
  colHead: { fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--fg3)", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" },
  kv: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 12, alignItems: "baseline" },
  k: { color: "var(--fg3)", whiteSpace: "nowrap" },
  v: { color: "var(--fg)", fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" },
  inp: { width: "100%", boxSizing: "border-box", padding: "5px 8px", border: "1px solid var(--border-lt)", borderRadius: 6, fontSize: 12, background: "var(--surface, #fff)", color: "var(--fg)" },
  lbl: { display: "block", fontSize: 10, fontWeight: 600, color: "var(--fg3)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.03em" },
  sub: { fontSize: 11, fontWeight: 700, color: "var(--navy)", margin: "12px 0 6px" },
  num: { fontVariantNumeric: "tabular-nums" },
};

function Field({ label, children, span = 1 }) {
  return (
    <label style={{ gridColumn: `span ${span}` }}>
      <span style={S.lbl}>{label}</span>
      {children}
    </label>
  );
}

export default function ClaimInvoiceModal({ claimId, onClose, onIssued }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ctx, setCtx] = useState(null); // { claim, project, projectClaims, lines, invoices }
  const [draft, setDraft] = useState(null);
  const [numberTouched, setNumberTouched] = useState(false);
  const [nextNo, setNextNo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: claim, error: cErr } = await supabase
        .from("claims")
        .select("id, claim_no, claim_number, claim_date, project_id, project_code, project_name, client_name, client_address, contact_person, amount, retention_amount, total_claim, certified_amount, prc_date, invoice_date, payment_terms, po_ref, wo_ref, wo_po_ref, status")
        .eq("id", claimId)
        .single();
      if (cErr || !claim) { if (!cancelled) { setErr(cErr?.message || "Claim not found."); setLoading(false); } return; }
      const [projRes, claimsRes, linesRes, settingRes, invRes] = await Promise.all([
        supabase.from("projects").select("id, project_code, name, location, scope, quotation_ref, contract_value, total_contract_value, vo_value, retention_pct, retention_cap_pct, payment_terms_days, client_po, contact_email, contact_person").eq("id", claim.project_id).single(),
        supabase.from("claims").select("id, claim_no, claim_date, project_code, project_name, client_name, client_address, contact_person, amount, certified_amount, payment_terms, po_ref, wo_ref, wo_po_ref, invoice_date").eq("project_id", claim.project_id),
        supabase.from("claim_lines").select("section, quotation_ref, seq, description, unit, qty, contract_amount, curr_amount, cum_amount, verified_amount").eq("claim_id", claimId).order("seq"),
        supabase.from("chase_settings").select("value").eq("key", "invoice_next_no").maybeSingle(),
        supabase.from("internal_invoices").select("id, invoice_number, invoice_date, claim_id, total, status").eq("project_id", claim.project_id).neq("status", "cancelled").order("invoice_date"),
      ]);
      if (cancelled) return;
      if (projRes.error) { setErr(projRes.error.message); setLoading(false); return; }
      const next = settingRes.data?.value ?? null;
      const c = { claim, project: projRes.data, projectClaims: claimsRes.data || [], lines: linesRes.data || [], invoices: invRes.data || [] };
      setCtx(c);
      setNextNo(next);
      setDraft(buildInvoiceDraft({ claim, project: projRes.data, projectClaims: c.projectClaims, lines: c.lines, nextRunningNo: next }));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [claimId]);

  const totals = useMemo(() => (draft ? computeInvoiceTotals(draft) : null), [draft]);
  const schedule = useMemo(() => (draft ? buildRetentionSchedule(draft.retentionRows) : null), [draft]);
  const certifiedNet = ctx?.claim?.certified_amount == null ? null : Number(ctx.claim.certified_amount);
  const tally = draft ? tallyWithCertificate(draft, certifiedNet) : null;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setDate = (iso) => setDraft((d) => ({ ...d, invoiceDate: iso, invoiceNumber: numberTouched ? d.invoiceNumber : invoiceNumberFor(nextNo, iso || d.invoiceDate) }));
  const setBlock = (bi, patch) => setDraft((d) => ({ ...d, quoteBlocks: d.quoteBlocks.map((b, i) => (i === bi ? { ...b, ...patch } : b)) }));
  const setItem = (bi, ii, patch) =>
    setDraft((d) => ({
      ...d,
      quoteBlocks: d.quoteBlocks.map((b, i) => (i === bi ? { ...b, items: relabelItems(b.items.map((it, j) => (j === ii ? { ...it, ...patch } : it))) } : b)),
    }));
  const addItem = (bi) => setDraft((d) => ({ ...d, quoteBlocks: d.quoteBlocks.map((b, i) => (i === bi ? { ...b, items: relabelItems([...b.items, { label: "", text: "", include: true }]) } : b)) }));
  const addBlock = () => setDraft((d) => ({ ...d, quoteBlocks: [...d.quoteBlocks, { kind: "vo", quoteRef: "", items: [{ label: "ITEM 1", text: "", include: true }] }] }));
  const setRetRow = (ri, patch) => setDraft((d) => ({ ...d, retentionRows: d.retentionRows.map((r, i) => (i === ri ? { ...r, ...patch } : r)) }));

  const issue = async () => {
    setErr("");
    if (!draft.invoiceNumber.trim()) return setErr("Enter the invoice number.");
    if (!(totals.totalDue > 0)) return setErr("The invoice total must be more than zero.");
    if (tally && !tally.ok && !window.confirm(`The invoice amount (${money(totals.totalAmount)}) does not match the certified amount (${money(certifiedNet)}), a difference of ${money(tally.diff)}.\n\nIssue it anyway?`)) return;
    setBusy(true);
    const payload = {
      invoice_number: draft.invoiceNumber.trim(),
      invoice_date: draft.invoiceDate,
      client_name: draft.clientName,
      client_address: draft.addressLines.filter(Boolean).join(", "),
      attn: draft.attn,
      email: draft.email,
      site: draft.site,
      payment_cert: draft.paymentCert,
      claim_nos: draft.claimNos,
      payment_terms: draft.paymentTerms,
      client_po: draft.customerPo,
      work_done: draft.workDone,
      quote_blocks: draft.quoteBlocks.map((b) => ({ ...b, items: b.items.filter((i) => i.include && i.text.trim()) })),
      cum_certified: totals.cumCertified,
      retention: totals.retention,
      payment_received: totals.paymentReceived,
      amount: totals.totalAmount,
      gst: totals.gst,
      total: totals.totalDue,
      retention_rows: schedule.rows,
      description: `${draft.site} — Progress Claim ${draft.claimNos}`,
    };
    const { data, error } = await supabase.rpc("issue_claim_invoice", { p_claim_id: claimId, p_invoice: payload, p_actor: actorName() });
    setBusy(false);
    if (error || !data?.ok) return setErr(data?.error || error?.message || "The invoice was not issued.");
    setIssued(data);
    set({ invoiceNumber: data.invoice_number });
    onIssued?.(data);
  };

  const claim = ctx?.claim;
  const project = ctx?.project;
  const lines = ctx?.lines || [];
  const workDoneCum = lines.reduce((s, l) => s + (Number(l.cum_amount) || 0), 0);
  const workDoneThis = lines.reduce((s, l) => s + (Number(l.curr_amount) || 0), 0);
  const verifiedCum = lines.reduce((s, l) => s + (Number(l.verified_amount) || 0), 0);
  const contractSum = project ? Number(project.total_contract_value ?? project.contract_value ?? 0) : 0;

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-modal" style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-head">
          <h3 className="cp-modal-title">
            Tax invoice{claim ? ` · ${claim.project_code} Claim #${claim.claim_no ?? claim.claim_number}` : ""}
            {issued && <span className="cp-pill cp-pill-invoiced" style={{ marginLeft: 8 }}>issued {issued.invoice_number}</span>}
          </h3>
          <button className="cp-modal-x" onClick={onClose}>&times;</button>
        </div>

        <div className="cp-modal-content">
          {loading && <div style={{ padding: 24, color: "var(--fg3)" }}>Loading the quotation, claim and certificate&hellip;</div>}
          {!loading && !draft && err && <div className="cp-modal-hint" style={{ color: "var(--red, #c0392b)" }}>{err}</div>}

          {!loading && draft && (
            <div style={S.grid}>
              {/* ── Quotation ─────────────────────────────── */}
              <section style={S.col}>
                <div style={S.colHead}>Quotation</div>
                <div style={S.kv}>
                  <span style={S.k}>Quote ref</span><span style={S.v}>{project.quotation_ref || "—"}</span>
                  <span style={S.k}>Contract sum</span><span style={{ ...S.v, ...S.num }}>{money(contractSum)}</span>
                  {Number(project.vo_value) > 0 && (<><span style={S.k}>Variations</span><span style={{ ...S.v, ...S.num }}>{money(project.vo_value)}</span></>)}
                  <span style={S.k}>Retention</span><span style={S.v}>{project.retention_pct ?? "—"}%{project.retention_cap_pct != null ? `, cap ${project.retention_cap_pct}% of sum` : ""}</span>
                  <span style={S.k}>Payment terms</span><span style={S.v}>{project.payment_terms_days != null ? `${project.payment_terms_days} days` : claim.payment_terms || "—"}</span>
                </div>
                <div style={S.sub}>Items (from the claim schedule)</div>
                {lines.length === 0 && <div style={{ fontSize: 12, color: "var(--fg3)" }}>This claim has no line items. The invoice lists the project scope; edit it on the right.</div>}
                <div style={{ display: "grid", gap: 4 }}>
                  {lines.map((l, i) => (
                    <div key={i} style={{ fontSize: 11.5, display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px dashed var(--border-lt)", paddingBottom: 3 }}>
                      <span style={{ minWidth: 0 }}>
                        {l.section === "B" && <span className="cp-pill cp-pill-pending" style={{ marginRight: 4 }}>VO</span>}
                        <strong>{(l.description || "").split("\n")[0]}</strong>
                        {l.qty != null && <span style={{ color: "var(--fg3)" }}> &middot; {Number(l.qty)} {l.unit}</span>}
                      </span>
                      <span style={{ ...S.num, whiteSpace: "nowrap" }}>{money(l.contract_amount)}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Progress claim ────────────────────────── */}
              <section style={S.col}>
                <div style={S.colHead}>Progress claim #{claim.claim_no ?? "—"}</div>
                <div style={S.kv}>
                  <span style={S.k}>Claim date</span><span style={S.v}>{fmtDate(claim.claim_date)}</span>
                  <span style={S.k}>Work done</span><span style={S.v}>{draft.workDone || "—"}</span>
                  {lines.length > 0 && (<>
                    <span style={S.k}>Work done this claim</span><span style={{ ...S.v, ...S.num }}>{money(workDoneThis)}</span>
                    <span style={S.k}>Work done to date</span><span style={{ ...S.v, ...S.num }}>{money(workDoneCum)}</span>
                  </>)}
                  <span style={S.k}>Claim amount</span><span style={{ ...S.v, ...S.num }}>{money(claim.amount)}</span>
                  <span style={S.k}>Retention (this claim)</span><span style={{ ...S.v, ...S.num }}>{money(claim.retention_amount)}</span>
                </div>
                <div style={S.sub}>Payment certificate</div>
                <div style={S.kv}>
                  <span style={S.k}>PRC received</span><span style={S.v}>{fmtDate(claim.prc_date)}</span>
                  <span style={S.k}>Certified (net)</span><span style={{ ...S.v, ...S.num, color: "var(--green-ink, #067647)" }}>{money(certifiedNet)}</span>
                  {verifiedCum > 0 && (<><span style={S.k}>Verified to date (gross)</span><span style={{ ...S.v, ...S.num }}>{money(verifiedCum)}</span></>)}
                </div>
                <div style={S.sub}>Earlier on this project</div>
                <div style={{ display: "grid", gap: 3, fontSize: 11.5 }}>
                  {ctx.projectClaims
                    .filter((c) => c.claim_no != null && c.claim_no < (claim.claim_no ?? Infinity))
                    .sort((a, b) => a.claim_no - b.claim_no)
                    .map((c) => {
                      const inv = ctx.invoices.find((i) => i.claim_id === c.id);
                      return (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <span>#{c.claim_no} &middot; certified {money(c.certified_amount)}</span>
                          <span style={{ color: "var(--fg3)", whiteSpace: "nowrap" }}>{inv ? `inv ${inv.invoice_number}` : c.invoice_date ? `invoiced ${fmtDate(c.invoice_date)}` : "not invoiced"}</span>
                        </div>
                      );
                    })}
                  {!ctx.projectClaims.some((c) => c.claim_no != null && c.claim_no < (claim.claim_no ?? Infinity)) && <span style={{ color: "var(--fg3)" }}>First claim on this project.</span>}
                </div>
              </section>

              {/* ── Invoice (editable) ────────────────────── */}
              <section style={{ ...S.col, background: "var(--surface, #fff)" }}>
                <div style={S.colHead}>
                  <span>Invoice</span>
                  {tally && (
                    <span className={`cp-pill ${tally.ok ? "cp-pill-certified" : "cp-pill-rejected"}`} title="Total amount before GST against the certified (net) amount">
                      {tally.ok ? "tallies with certificate" : Number.isNaN(tally.diff) ? "no certified amount" : `${money(tally.diff)} vs certificate`}
                    </span>
                  )}
                </div>
                <fieldset disabled={!!issued} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
                    <Field label="Invoice no." span={2}><input style={S.inp} value={draft.invoiceNumber} onChange={(e) => { setNumberTouched(true); set({ invoiceNumber: e.target.value }); }} /></Field>
                    <Field label="Invoice date"><input style={S.inp} type="date" value={draft.invoiceDate} onChange={(e) => setDate(e.target.value)} /></Field>
                    <Field label="Job ref"><input style={S.inp} value={draft.jobRef} onChange={(e) => set({ jobRef: e.target.value })} /></Field>
                    <Field label="To" span={2}><input style={S.inp} value={draft.clientName} onChange={(e) => set({ clientName: e.target.value })} /></Field>
                    <Field label="Payment cert no."><input style={S.inp} value={draft.paymentCert} placeholder="e.g. PC-001" onChange={(e) => set({ paymentCert: e.target.value })} /></Field>
                    <Field label="Claim no(s)."><input style={S.inp} value={draft.claimNos} onChange={(e) => set({ claimNos: e.target.value })} /></Field>
                    <Field label="Address (one line each)" span={2}>
                      <textarea style={{ ...S.inp, resize: "vertical" }} rows={3} value={draft.addressLines.join("\n")} onChange={(e) => set({ addressLines: e.target.value.split("\n").slice(0, 3) })} />
                    </Field>
                    <div style={{ gridColumn: "span 2", display: "grid", gap: 8 }}>
                      <Field label="Payment terms"><input style={S.inp} value={draft.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} /></Field>
                      <Field label="Customer's PO"><input style={S.inp} value={draft.customerPo} onChange={(e) => set({ customerPo: e.target.value })} /></Field>
                    </div>
                    <Field label="Attn" span={2}><input style={S.inp} value={draft.attn} onChange={(e) => set({ attn: e.target.value })} /></Field>
                    <Field label="Email" span={2}><input style={S.inp} value={draft.email} onChange={(e) => set({ email: e.target.value })} /></Field>
                    <Field label="Site / project" span={3}><input style={S.inp} value={draft.site} onChange={(e) => set({ site: e.target.value })} /></Field>
                    <Field label="Work done"><input style={S.inp} value={draft.workDone} onChange={(e) => set({ workDone: e.target.value })} /></Field>
                  </div>

                  <div style={{ ...S.sub, display: "flex", justifyContent: "space-between" }}>
                    <span>Description (untick lines the customer asked to leave off)</span>
                    <button type="button" className="cp-btn-copy" onClick={addBlock}>+ VO quotation</button>
                  </div>
                  {draft.quoteBlocks.map((b, bi) => (
                    <div key={bi} style={{ border: "1px solid var(--border-lt)", borderRadius: 8, padding: 8, marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{b.kind === "vo" ? "VO quote ref" : "Quote ref"}</span>
                        <input style={S.inp} value={b.quoteRef} onChange={(e) => setBlock(bi, { quoteRef: e.target.value })} />
                      </div>
                      {b.items.map((it, ii) => (
                        <div key={ii} style={{ display: "grid", gridTemplateColumns: "20px 56px 1fr", gap: 6, alignItems: "center", marginBottom: 4, opacity: it.include ? 1 : 0.45 }}>
                          <input type="checkbox" checked={it.include} onChange={(e) => setItem(bi, ii, { include: e.target.checked })} title={it.include ? "Leave this line off the invoice" : "Put this line back"} />
                          <span style={{ fontSize: 11, fontWeight: 700 }}>{it.label || "—"}</span>
                          <input style={{ ...S.inp, fontWeight: 600, textDecoration: it.include ? "none" : "line-through" }} value={it.text} onChange={(e) => setItem(bi, ii, { text: e.target.value })} />
                        </div>
                      ))}
                      <button type="button" className="cp-btn-copy" onClick={() => addItem(bi)}>+ item</button>
                    </div>
                  ))}

                  <div style={S.sub}>Figures</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: "6px 10px", alignItems: "center", fontSize: 12 }}>
                    <span>Total Value of Certified (gross, to date)</span>
                    <input style={{ ...S.inp, textAlign: "right", ...S.num }} type="number" step="0.01" value={draft.cumCertified} onChange={(e) => set({ cumCertified: numOrNull(e.target.value) ?? 0 })} />
                    <span>{retentionLabel(draft)}{totals.retentionCap != null && <span style={{ color: "var(--fg3)" }}> &middot; cap {money(totals.retentionCap)}</span>}</span>
                    <input style={{ ...S.inp, textAlign: "right", ...S.num }} type="number" step="0.01"
                      value={draft.retentionOverride ?? totals.retention}
                      onChange={(e) => { const v = numOrNull(e.target.value); set({ retentionOverride: v == null || v === defaultRetention(draft) ? null : v }); }}
                      title="Taken from the page-2 retention column (else the % of certified, capped); overwrite it if the certificate shows a different retention" />
                    <span>Less: Payment Received <span style={{ color: "var(--fg3)" }}>(earlier certificates)</span></span>
                    <input style={{ ...S.inp, textAlign: "right", ...S.num }} type="number" step="0.01" value={draft.paymentReceived} onChange={(e) => set({ paymentReceived: numOrNull(e.target.value) ?? 0 })} />
                    <strong>Total Amount</strong><strong style={{ textAlign: "right", ...S.num }}>{money(totals.totalAmount)}</strong>
                    <span>GST {draft.gstPct}%</span><span style={{ textAlign: "right", ...S.num }}>{money(totals.gst)}</span>
                    <strong>Total Balance Due for this Invoice</strong><strong style={{ textAlign: "right", fontSize: 14, ...S.num }}>{money(totals.totalDue)}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 4 }}>SGD {spellAmount(totals.totalDue)}</div>

                  <details style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", cursor: "pointer" }}>Page 2 &middot; Accumulative Retention ({draft.retentionRows.length} certificate{draft.retentionRows.length === 1 ? "" : "s"})</summary>
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: "4px 8px", fontSize: 11.5, marginTop: 6, alignItems: "center" }}>
                      <span style={S.k}>Certificate</span><span style={{ ...S.k, textAlign: "right" }}>Total certified</span><span style={{ ...S.k, textAlign: "right" }}>Retention</span><span style={{ ...S.k, textAlign: "right" }}>Payment claim</span>
                      {schedule.rows.map((r, ri) => (
                        <React.Fragment key={ri}>
                          <input style={S.inp} value={r.label} onChange={(e) => setRetRow(ri, { label: e.target.value })} />
                          <input style={{ ...S.inp, textAlign: "right" }} type="number" step="0.01" value={r.certified} onChange={(e) => setRetRow(ri, { certified: numOrNull(e.target.value) ?? 0 })} />
                          <input style={{ ...S.inp, textAlign: "right" }} type="number" step="0.01" value={r.retention} onChange={(e) => setRetRow(ri, { retention: numOrNull(e.target.value) ?? 0 })} />
                          <span style={{ textAlign: "right", ...S.num }}>{money(r.payment)}</span>
                        </React.Fragment>
                      ))}
                      <strong>Cum. to date</strong>
                      <strong style={{ textAlign: "right", ...S.num }}>{money(schedule.total.certified)}</strong>
                      <strong style={{ textAlign: "right", ...S.num }}>{money(-schedule.total.retention)}</strong>
                      <strong style={{ textAlign: "right", ...S.num }}>{money(schedule.total.payment)}</strong>
                    </div>
                    {Math.abs(schedule.total.certified - draft.cumCertified) > 0.005 && (
                      <div className="cp-modal-hint" style={{ marginTop: 6 }}>Page 2 adds up to {money(schedule.total.certified)} certified; page 1 says {money(draft.cumCertified)}.</div>
                    )}
                  </details>
                </fieldset>
              </section>
            </div>
          )}

          {!loading && draft && err && <div className="cp-modal-hint" style={{ color: "var(--red, #c0392b)", marginTop: 10 }}>{err}</div>}
          {!loading && draft && !issued && (
            <div className="cp-modal-hint" style={{ marginTop: 10 }}>
              Issuing records the invoice, marks the claim <strong>invoiced</strong> and starts the Payment chase from the invoice date. Attach the customer's Payment Certificate when you send it.
            </div>
          )}
          {issued && (
            <div className="cp-modal-hint" style={{ marginTop: 10 }}>
              Invoice <strong>{issued.invoice_number}</strong> issued. The claim is now in the Payment chase. Download or print it to send with the Payment Certificate.
            </div>
          )}
        </div>

        <div className="cp-modal-actions">
          <button className="cpc-btn" onClick={onClose}>{issued ? "Close" : "Cancel"}</button>
          <button className="cpc-btn" disabled={!draft} onClick={() => exportInvoiceToExcel(draft)}>Download Excel</button>
          <button className="cpc-btn" disabled={!draft} onClick={() => printInvoice(draft)}>Print / PDF</button>
          {!issued && (
            <button className="cpc-btn primary" disabled={!draft || busy} onClick={issue}>
              {busy ? "Issuing…" : "Issue invoice"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
