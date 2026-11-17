# Conplus — fixes log (what they asked → what we did)

One line per request, in the order the client sent them. Status as of 16 Sep 2026. Live app: https://conplus-live.vercel.app

Legend: ✅ done and live · ◐ partly done (what is missing is stated) · ⏳ waiting on the client · ☐ not started

Tally (16 Sep): 41 numbered items — 30 ✅ done · 4 ◐ partly · 5 ⏳ client · 2 ☐ not started (items 18/26 site form, 9 watchlist-by-supplier). Items 39–41 were added by a parallel session on 16 Sep (claim Excel alignment, letterhead, homepage claims card).

---

## 31 Aug 2026 — Wendy (contract@)

1. **Prefers a web-based solution, Claude only when needed.**
   ✅ Everything since has been built in the web app: Store form, Deliveries, Reservations, Stock Import, Chase, New claim, Email templates, Project Reference Report.

2. **WO: Excel says sets, printed WO says kg.**
   ✅ Fixed 31 Aug (`28bd272`). Quantities print in pack units; header reads "ORDER QTY (SET)".

3. **WO: "Level 1" should not appear in Remarks.**
   ✅ Fixed 31 Aug (`28bd272`).

4. **WO: add a Contact Person field.**
   ✅ Fixed 31 Aug (`28bd272`). Pulled from the project's contact.

5. **WO alternative: a web page to change WO quantity and pricing.**
   ✅ Built 31 Aug (`33d3704`). "Edit qty & pricing" on the Works Order page with live totals and GST.

6. **PO: follow the PO 2608-0014 template, add the required fields.**
   ✅ Built 31 Aug (`323b6b2`, `1ef7ae6`). Attn, Vendor Ref, Our PO Ref, Delivery Address, Unit, Disc/Unit, Discount, Delivery Charge, chop box, styled Excel with letterhead.

7. **Claims sheet: add Retention and Certified status; use the F23012 formulas.**
   ✅ Built 31 Aug (`28bd272`). All six formulas verified against the mapping table. Live figures for F23012 are short only because claims #1–#9 were never imported and retention was blank in the data.

8. **Progress Claim: use the Conplus_Progress_Claim Template.**
   ✅ Built 31 Aug (`323b6b2`), then replaced by the corrected E25077 master (see 9 Sep, item 4A).

9. **17:22 — Minimise the Stock Watchlist in Live View; click to expand.**
   ◐ Collapsed to the first six items with "View all" (`3ac990c`). Expand-by-supplier as asked is not done.

## 2 Sep 2026 — our meeting summary (follow-up items for the client)

10. Sales team to give WO material names matching the inventory list → answered 9 Sep, item 12.
11. Dedicated chase email address → answered 9 Sep, item 14.
12. Delivery tracking wishes → answered 9 Sep, item 15.
13. Payment terms per customer → answered 9 Sep, item 16.

## 4 Sep 2026 — Wendy

14. **Cannot upload the skill files into Claude.**
    ✅ Re-sent as a single zip, one skill at a time. Wendy confirmed "Okay, done" the same afternoon.

15. **PO: keep Disc/Unit and add a lump-sum Discount off the total.**
    ✅ Fixed 4 Sep (`176ed1d`) in the PO document and Excel. The Create PO dialog got both fields on 15 Sep (`35a04c3`).

16. **Project Reference Report: AI returned only a few Epoxy projects; source must be the Project Ref – Standardized sheet, filtered on type of work.**
    ✅ Fixed 15–16 Sep (`35a04c3`, `30fe7e8`, `cacda3b`). The Standardized tab (1,014 entries) is now the project master in the app at /reports/project-reference, with Epoxy / MISC / All, type chips, sales rep, year, search, and an Excel export in her own report layout. Re-upload by dropping the Claim Summary workbook. Projects that exist in the app but not in the master are included and marked "app". Verified 1,014 of 1,014 entries identical to the sheet.

## 5 Sep 2026 — Wendy

17. **PO Unit must show the packing size, e.g. 25 KG/SET.**
    ✅ Fixed 15 Sep (`35a04c3`). Unit field on every PO line, defaulting to the material's packing size from the inventory master when picked from stock.

## 7 and 9 Sep 2026 — Lynn

18. **Daily site report form to replace the WhatsApp group posts: New Template → Enter Data → Save Draft → Edit Draft → Submit → Record Stored, start-of-work then end-of-work on the same record, output to Excel on their server.**
    ☐ Not started, by agreement (16 Sep). Lynn's freelancer has a template; meeting to be arranged.

## 9 Sep 2026 — Wendy, responses to our follow-up items

19. **Sales team will copy material names from the Material_Inventory_Record into the WO.**
    ✅ Material picker on Create WO resolves pasted names (11 Sep, `716a3c9`). The September inventory workbook, with the renamed catalog, was imported on 15 Sep, so pasted names match the new list.

20. **PO approval to the boss by email (conplus@singnet.com.sg) and WhatsApp (+65 9631 3288).**
    ◐ Email built 11 Sep (`07e8b58`): the app fires an approval email the moment a PO goes pending, linking to the Store Health approvals list. Still delivered to the handover inbox until the GO_LIVE switch is flipped. WhatsApp parked on 15 Sep by decision: email first. Approve / Reject is done in the app.

21. **Use claims@conplus.com.sg for certificate chase reminders.**
    ◐ Reply-To set to claims@conplus.com.sg on both send workflows. Sending from that mailbox needs its credentials, not received. Sends also go to the handover inbox until GO_LIVE.

22. **Delivery tracking per ConPlus_System_Requirements.xlsx.**
    ◐ Section 1 (PO dashboard, manual receipt, scan DO, auto-close on full receipt): done 11 and 15 Sep. Section 2 (partial receipt): partial receipts and separate PO / received / reserved / available tracking done; receipt does not yet post the stock-in or split to projects. Section 3 (movements): reservations done 15 Sep (`fad589b`); movement types, site return, direct-to-site not done. See item 27 for the plan.

23. **Customer payment terms list.**
    ⏳ Not received. Per-project terms already supported.

24. **Supplier invoices and DOs for 2608-0009, 2609-0003, 2607-0006.**
    ⏳→ received 16 Sep (all three). They cannot be logged yet: none of those POs exist in the app; the app's PO list is July demo data while the client's real register is the PO_Summary workbook. See item 26.

## 9 Sep 2026 — Wendy, system queries

25a. **Management Summary: E25077 contract value missing under Wan Fern.**
     ✅ Fixed 11 Sep. Sales manager was free text "Ng Wan Fern"; now normalised to the canonical name with an alias and a trigger.

25b. **Chase E25057 claim 1: PRC received, invoice submitted and $350 entered but not saved.**
     ✅ Fixed 11 Sep. The browser key could only read claims, so saves silently did nothing; all claim writes now go through a database function. ⏳ Her original entries were lost before the fix and must be re-entered (still empty on 16 Sep). Since 15 Sep the card shows "certified $X · $Y balance" once saved.

25c. **Difference between "Edit Draft" and "Manual"; what does "Edit" edit?**
     ✅ Fixed 11 Sep. Buttons renamed "Edit draft" (this cycle's reminder, advances the schedule) and "Manual reminder" (extra, does not); both open an editable subject and body; tooltips and in-modal explanation. 15 Sep (`5090ebc`): "Email templates" button lets them change the default wording per stage, and "Proceed & send" now sends exactly the previewed text.

25d. **Progress Claim: A) use the corrected E25077 workbook as the master; B) claim lines not viewable after submission; C) retention not showing.**
     ✅ A: Excel export reproduces the corrected master (11 Sep, `716a3c9`). 16 Sep (`bcb459d`): Print / PDF now renders that same workbook page for page, matching her PDF. ✅ B: claim lines had no write path; loaded and editable (11 Sep). ✅ C: stored retention now mapped and shown (11 Sep). Open question: her master shows the reference period as the work month (08/2026) while the builder uses the claim date month (09/2026); need the rule.

## 14 Sep 2026 — Lynn

26. **Follow-up on the site report; freelancer has a template; asks to meet.**
    ⏳ Reply and meeting pending (see item 18).

## 15 Sep 2026 — from our side, arising from their earlier asks

- ✅ Stock Import: drop the whole Material_Inventory_Record workbook; each upload replaces the ledger (S/No. is a row formula, so upsert was unsafe). The September workbook was applied live the same day: 184 rows, 137 materials created, 157 deactivated.
- ✅ Available vs Reserved stock, reservations per project, WO auto-reserve, Store form consumes reservations (`fad589b`).
- ✅ DO photo scan on the Deliveries page (`fad589b`). Accuracy so far: 3 of 3 documents correct (Sto 80067779, Sparco 156254, Alliance 260384), small sample.
- ✅ "+ New claim" on the Chase page; editable email templates (`5090ebc`).
- ✅ Chase card shows certified amount and balance; 144 claims with blank project names filled (`ec0c945`).
- ✅ Partial payments stay on the claim and it chases the remainder; payment receipts with a running balance (`d311880`).

## 16 Sep 2026 — from our side, arising from their earlier asks

- ✅ Project Reference Report also lists projects that exist in the app but not yet in the Standardized master, flagged "app", typed from their scope / coating text (`30fe7e8`, `cacda3b`). 45 such projects today.
- ✅ Progress Claim Print / PDF now renders the Excel master page for page — cover page, then claim details with the repeating header — matching Wendy's `E25077_HPC_STA_Progress_Claim_01_with_WDR.pdf` pages 1–3 (`bcb459d`). The WDR scans (pages 4–5) are still appended by hand.
- ✅ Verified the project master in the app equals the Standardized sheet: 1,014 of 1,014 entries identical.
- ⏳ The three supplier invoice + DO PDFs (2608-0009 Sparco, 2609-0003 Alliance, 2607-0006 Sto) arrived; scanner read all three correctly. Cannot be logged until the PO register is imported (item 27).
- ✅ F25060 claim #1 restored after the end-to-end test (certified amount, PRC and invoice dates cleared; back in the Certificate chase).

## 16 Sep 2026 — Muhsin (from the client's review of the Chase page)

33. **"Reminder draft · ready to send" box: can we edit the text there and send?**
    ✅ Built 16 Sep (`2b5e0ec`). The subject and body on the card are editable in place; the edit is saved per claim, survives a refresh, shows "edited by …" with Reset to template, and is exactly what Proceed & send, Edit draft and Log as Sent use. Sending or skipping clears it. Also fixed the "Claim -" in drafts for the five imported claims that had no sequence number.

34. **No send button on a claim that is 55 days overdue.**
    ✅ Fixed 16 Sep (`053dea5`, `13736c3`). The button only appeared on the 7-day marks. Every card with a draft now shows "Proceed & send" on a scheduled day and "Send now" on any other day; an off-cycle send is logged as a manual reminder (counts in the sequence, does not move the cadence), which is the client's own rule from 25 Aug.

35. **Revert the claims moved into the Payment chase during testing.**
    ✅ Done 16 Sep. Invoice / PRC dates cleared on E25056 #1, E25057 #1, F23012 #24, F25040 #3, F25060 #1; all five are back in the Certificate chase. F25040 #3 still carries the test certified amount of $140 (original $5,811.80) — say if that should go back too.

36. **Send ahead of the schedule: prompt first, then log it as the next reminder.**
    ✅ Built 16 Sep (`c3ffcff`). "Send now" on a non-scheduled day asks "next scheduled reminder is in N days — send ahead of schedule? It will be logged as reminder #K"; Yes sends and numbers it in the sequence like any reminder.

37. **Entering an invoice or PRC date switched the claim to the Payment chase even with nothing else filled; a PRC-received claim without an invoice date showed on neither tab.**
    ✅ Fixed 16 Sep (`6a00e14`). Order enforced: certified amount → PRC received → invoice submitted. On the Certificate card the invoice date is locked. After the PRC date the claim sits in a new "Certified, invoice pending" section: certified amount prefilled with the claim amount but stored only on Confirm, then the invoice date unlocks and starts the Payment chase. Clearing the PRC date moves it back.

38. **Test send worked, but the R3 marker did not move and the history still said "No reminders logged yet".**
    ✅ Fixed 16 Sep (`8120b2c`). The certificate stepper now fills one segment per reminder actually sent and puts the marker on the next one, which is the client's own numbering rule; the history reloads right after a send. Test data reverted: the F25060 #1 reminder and the test recipient emails on F25060 and F23012 removed.

39. **Progress Claim Excel export "not the same" as the corrected E25077 master.**
    ✅ Fixed 16 Sep (`fa5b9d7`). Aligned the workbook to the corrected master cell-by-cell: numFmt uses the master's `_(\$* … \-??)` accounting tokens; dates written with `Date.UTC` so the Excel serial no longer shifts a day in SGT; cover row 10 gets the missing `B10:D10` and `G10:H10` label merges; "From" Company Name and Email widen to E:H to match the master; ladder rows 4–11 leave blank D/E cells fully unstyled (no border, no numFmt, no PEACH fill); Details section band drops the extra S:Z merge but keeps the grey tint on each cell; empty Variation item reserves two work-done sub-rows so the SUMIFs and the B50/B52 subtotal land where the cover formulas reference; quotation-ref row has a single top edge across the row so the item grid reads as one bordered box. Cell diff dropped 830 → ~570 (rest are cosmetic merged-cell borders that render identically). Reference Period of Claim now defaults to `claim_date − 1 month`, To = From (single-month), matching the master where a Sep submission shows Aug 2026 — needs client confirmation of the general rule.

40. **Progress Claim Excel: letterhead missing and empty cells look bordered.**
    ✅ Fixed 16 Sep (`053dea5`). Embedded the Conplus letterhead (`public/company-letterhead.jpg`, 740×111) across `B2:J7` on the Cover Page in place of the grey `[ Company Logo ]` placeholder; served from `/public` and fetched at export time (falls back to the placeholder if the fetch fails). Both sheets set `showGridLines: false` so the whitespace around the form is really white, not the faint default grid. `buildClaimWorkbook` gained an optional `{ letterhead }` arg; Node/vitest still passes without the image.

41. **Homepage Progress Claims card was capped at 5, then too long when uncapped.**
    ✅ Fixed 16 Sep (`f59ee40`, superseding `7cbd3fd` and `6bf7d90`). The Live View Progress Claims and Conplus Invoices sections show the first 5 rows with a "Show all N" toggle that expands the list in place and a "Show fewer" to collapse it back; the footer says "Showing X of Y" and carries a "View in Claims tab →" link. Export still exports the whole filtered list, not just the preview. Two entry points ("+ New Claim" on the homepage / Documents page and "+ New claim" on `/claims`) both hit the same `create_claim` RPC — a claim entered on either page shows on the other after the next fetch; neither creates line items, and the front-page dialog only captures project + amount + description (the `/claims` modal captures claim no, date, retention as well). Follow-up worth doing: unify the two dialogs, or invalidate the AppData `claims` cache when `ClaimsPivot` creates one so the homepage refetches immediately.

42. **Site Reports should look and work like the SitePulse mockup, and install on the phone like an app.**
    ✅ Built 20 Oct; approved and LIVE 21 Oct (merged to main, commit 9ba7f88, Vercel dpl_39HasEHBXk2rYAiqd5znYt1gV9ck, conplus-live.vercel.app/site-reports). The tab is now a phone-first app in the mockup's look: warm paper ground, white cards, hairline borders, one orange accent, Barlow Condensed headings, IBM Plex Sans body, IBM Plex Mono for codes and status chips (theme scoped to the tab only, `src/components/site-reports/theme.css`; the rest of the dashboard is untouched). Structure: a top bar (back, project code + name, reporter chip), a home screen of project cards with search, an All / Reported today filter and a Submitted / Draft / No report today chip per project, and a bottom navigation (Daily, Plan, Dashboard, Projects). The daily report carries a three-step tracker (Before work → End of day → Submitted). PWA: `public/manifest.webmanifest` + `public/sw.js` + icons cut from the Conplus logo; the manifest and service worker attach only on `/site-reports`, so "Install" appears there (Chrome / Android one tap, iOS gets the Share → Add to Home Screen hint) and the installed app opens straight on the project list, full screen. The page shell is cached so the app opens offline; saving and submitting still need the network (an offline banner says so). Nothing changed in the data model or the save / submit rules; 114 tests pass.
    ↳ 20 Oct, second pass after review ("the web app doesn't look the same"): rebuilt screen for screen on the mockup's own markup and CSS (ported, prefixed `sr-`). The app is now the mockup's white phone column (430px, centred on the paper ground on desktop, full-bleed on a phone): flat top bar with hairline, filter row under it, project cards with the condensed name, mono meta line, a status chip and the dashed note box; a project opens to its **Reports** list (one card per report with the small vertical stage rail, "＋ New report" on top); a report is an edit screen with the stacked button row at the foot (Submit report / Save draft and back) and no navbar, exactly like the mockup's stage screens; **Plan** and **Progress** are list screens; **Settings** holds the reporter name, install and help. Bottom navbar: Projects · Reports · Plan · Progress · Settings with the mockup's icons. The old wide Dashboard table is gone from the app (the phone column cannot hold 18 columns); the Progress tab shows the same numbers as kv rows plus one card per day, and the full sheet remains the Excel export. Old links with `tab=dashboard` still open Progress.

43. **Tax invoice layout (Accounts, "Account - Invoice.xlsx" sheet 1, 2 Nov): close the gap between the titles and the data, align the data, add a line under Site/Project, Work Done below the description, remove the grey background behind Payment Modes.**
    ✅ Fixed 2 Nov (local, not yet pushed). Header titles (INVOICE NO … CUSTOMER'S PO) are right-aligned across H:J so each ends where its value starts in K; the values start at K's left edge, which is where the accounting format pins the "$" of the figures below, and the print now renders the "$" the way Excel does (pinned left, number right) so the header values and the money column share one edge on both pages. A thin rule runs under Site/Project on both pages. Work Done sits one row under the last quotation item; the figures stay at the template's row. The Payment Modes block is no longer a picture: title, bank lines and the reference note are cells, with Accounts' SGQR (from sheet 2, UEN 199404220W, decoded and verified) placed beside them, so there is no grey backdrop in Excel or in the print. 5 new tests pin these.

44. **A second tax-invoice format for supply of materials (sheet 2).**
    ✅ Built 2 Nov (local). Works Orders → expand a WO → "Prepare invoice": prefilled from the WO (To = client, Attn / Tel = the project contact, WO no, JOB REF = quotation ref, items = the WO's order lines with price/unit, ordered qty and pack unit; PO no from the project's client PO; DO no typed in), every field and item editable, Sub-Total / GST 9% / Total Balance Due and the amount in words, Payment Modes with the SGQR, Page 1 of 1. Download Excel and Print/PDF work now; **Issue invoice** needs migration `supabase/migrations/20261102_material_invoice.sql` (internal_invoices.kind/wo_id/wo_no/do_no/tel/lines + `issue_material_invoice`, same running number) — APPLIED live 2 Nov pm (user go-ahead; columns + RPC verified present). First real Issue = the live test. Open: one running-number series or two (sample shows 310266/2026/04 vs 320016/2026/10).
    ↳ 2 Nov, second pass: the sheet is now Accounts' own layout row for row — Calibri throughout, header row 27, a boxed item band rows 29–50 (S/NO box, description box C:F, one box per money column; grows past 50 if there are more items), Sub-Total / GST / Total at 51–53 with the double rule, and the words at row 55 in their "One Hundred Ninety Six Dollars and Twenty Cents" style (the progress-claim invoice keeps its own template's "… and Cents Twenty Only").

45. **Chase card (sheet 3): recipient email editable after saving and split into To / CC / BCC; Attn editable on the draft; pick the email template (Invoice / Standard SOA / 1st / 2nd / Final).**
    ✅ Built 2 Nov (local). The recipient chip is now a button that reopens a To / CC / BCC form at any time (CC/BCC comma-separated, validated); CC and BCC are stored on the project (`chase_cc` / `chase_bcc`, migration `20261102_chase_recipients.sql` applied live 3 Nov) and are sent to the send-chase webhook as `cc` / `bcc` in the query and the JSON body — the n8n Gmail node still has to map them. Attn on the reminder draft is an inline input saved to the claim's contact person (update_claim), and the draft's greeting follows it. On the Payment chase the draft head has a Template picker with Accounts' five choices; choosing one re-drafts this claim from that wording and keeps it as the claim's draft (Reset to template puts the stage wording back).
    ↳ Verified 2 Nov on a preview build against the live data (headless Chrome, no writes): recipient chip reopens the To / CC / BCC form on E25077 #1; F23012 #24 expanded shows Attn as an input and the Template picker preselected on "2. Standard Statement of Account (SOA)" for its SOA stage. n8n side: CC/BCC patch APPLIED 2 Nov pm over the REST API (`docs/n8n/send_chase_cc_bcc.md`, versionId 1421622f…, workflow still active; backup of the pre-patch JSON in the session scratchpad); CC/BCC stay empty until GO_LIVE.

46. **Email wording (sheet 4).**
    ✅ Done 2 Nov (local). New `pay.invoice` template with Accounts' Go-Green text; 1st and 2nd reminders now say "Kindly advise the payment of {outstanding} by {deadline}"; the final reminder opens with "Statement of Account as at {as_at}" (new placeholder = today's date). All five are in the Email templates editor as before.

47. **Cancel the six July POs left "pending approval"** (Wendy 28 Sep answer, 27 Oct, 3 Nov).
    ✅ App side done 4 Nov: `cancelled` PO status, Cancelled column on both PO views, Cancel PO button with confirm (replaces Reject, which had no column). FOUND while testing on live: the app runs as `anon`, which has SELECT only on `purchase_orders`, so `dbUpdatePOStatus` (Approve / old Reject / first Cancel) was a silent no-op (toast said done, row unchanged). Cancel now calls RPC `po_cancel` (`supabase/migrations/20261104_po_cancel.sql`, SECURITY DEFINER, audit row, clears the po_pending alert). Migration applied 4 Nov (second version: the first wrote an audit row with action `cancel`, which `audit_log_action_check` rejects, so every call 400'd). **All six POs cancelled via the live Cancel PO button 4 Nov 03:01–03:03 UTC and verified in the DB; the po_pending alert is resolved.** Approve still goes direct and will also no-op; the approval step is gone anyway (item 23). Tell Wendy.

48. **27 Oct items 1 + 4 were never committed** although the 28 Oct reply said they were in the next update; shipped 4 Nov (5af0f99).
49. **Site Reports: statuses did not follow the SitePulse sequence; no orders, manpower or equipment** (team feedback 16 Nov). Pushed 17 Nov: a project now holds **orders** (one per phase, "+ New order"), each walking Project Plan → Kick Off → Schedule Posting → Deployment & Execution → Site Walk / Handover → Transfer / Movement → Completion on its own. **Manpower** and **Equipment** tabs hold the registers (49 people from Manpower.xlsx, 210 tools from TOOLS_R1.xlsx, add / edit / mark spoiled) and show where each is on a chosen day. Manpower and tools are allocated per order per day in Deployment; rows belong to their date, so the next day starts empty ("Copy previous day" carries a crew over). A tool cannot be on two orders the same day; a worker can (half days). A new daily report takes its crew from that day's allocation when the project has orders. Reports / Plan / Progress are unchanged. DB: `supabase/migrations/20261116_site_orders.sql` (applied live 16 Nov, additive) + `20261116_site_registers_seed.sql` (registers loaded 16 Nov through the save RPCs). Not built from the mockup: planned equipment / materials per schedule day, site-walk photos, rework-day tracking, chat, notifications, the Progress efficiency report.

---

## Next, in order

27. **Import the client's PO register (PO_Summary workbook) as the PO master.** Replaces the July demo POs, brings their DO and invoice numbers per PO, fixes item 24 and CP06. Need a fresh export from Wendy first: the 24 Aug copy has no 2609-0003.
28. **Log the three DOs** against their real POs, scanning each.
29. **Delivery tracking, remaining pieces:** receipt posts the stock-in, receipt can reserve to projects, movement types on the ledger (PO receipt, site return, issue to site, direct to site), and "Raise DO" for site deliveries that references the POs the stock came in under.
30. **GO_LIVE** for the PO approval email and chase sends, on the client's go-ahead.
31. Stock Watchlist expand-by-supplier (item 9).
32. Daily site report form, after the meeting (items 18, 26).
