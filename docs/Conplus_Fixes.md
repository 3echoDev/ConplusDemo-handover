# Conplus — fixes log (what they asked → what we did)

One line per request, in the order the client sent them. Status as of 16 Sep 2026. Live app: https://conplus-live.vercel.app

Legend: ✅ done and live · ◐ partly done (what is missing is stated) · ⏳ waiting on the client · ☐ not started

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

## 16 Sep 2026 — Muhsin (from the client's review of the Chase page)

33. **"Reminder draft · ready to send" box: can we edit the text there and send?**
    ✅ Built 16 Sep (`2b5e0ec`). The subject and body on the card are editable in place; the edit is saved per claim, survives a refresh, shows "edited by …" with Reset to template, and is exactly what Proceed & send, Edit draft and Log as Sent use. Sending or skipping clears it. Also fixed the "Claim -" in drafts for the five imported claims that had no sequence number.

34. **No send button on a claim that is 55 days overdue.**
    ✅ Fixed 16 Sep (`053dea5`, `13736c3`). The button only appeared on the 7-day marks. Every card with a draft now shows "Proceed & send" on a scheduled day and "Send now" on any other day; an off-cycle send is logged as a manual reminder (counts in the sequence, does not move the cadence), which is the client's own rule from 25 Aug.

35. **Revert the claims moved into the Payment chase during testing.**
    ✅ Done 16 Sep. Invoice / PRC dates cleared on E25056 #1, E25057 #1, F23012 #24, F25040 #3, F25060 #1; all five are back in the Certificate chase. F25040 #3 still carries the test certified amount of $140 (original $5,811.80) — say if that should go back too.

---

## Next, in order

27. **Import the client's PO register (PO_Summary workbook) as the PO master.** Replaces the July demo POs, brings their DO and invoice numbers per PO, fixes item 24 and CP06. Need a fresh export from Wendy first: the 24 Aug copy has no 2609-0003.
28. **Log the three DOs** against their real POs, scanning each.
29. **Delivery tracking, remaining pieces:** receipt posts the stock-in, receipt can reserve to projects, movement types on the ledger (PO receipt, site return, issue to site, direct to site), and "Raise DO" for site deliveries that references the POs the stock came in under.
30. **GO_LIVE** for the PO approval email and chase sends, on the client's go-ahead.
31. Stock Watchlist expand-by-supplier (item 9).
32. Daily site report form, after the meeting (items 18, 26).
