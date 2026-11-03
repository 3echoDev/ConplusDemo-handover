# Accounts' changes — "Account - Invoice.xlsx" (received 2 Nov 2026)

Source: `Downloads/Account - Invoice.xlsx` (Chloe, accounts@). Four sheets; two are
marked-up screenshots of our output, one is a new invoice layout, one is email wording.
Status column is kept current as items close. Numbering continues in `docs/Conplus_Fixes.md`.

## Sheet 1 — "Invoice - Layout Adjustments" (marked-up Tax Invoice 320016/2026/10, F23012 #24)

| # | Ask (their words) | Where | Status |
|---|---|---|---|
| A1 | "Could u please help to close the gap between the titles & the data" — header block (INVOICE NO / GST REG NO / INVOICE DATE / PAYMENT CERT / CLAIM NO / JOB REF / PAYMENT TERMS / CUSTOMER'S PO). Same on page 2 ("1. Could u pls help to close the gap"). | `src/lib/invoiceExcel.ts` writeHeader | ✅ |
| A2 | "Align the data" — the header values must line up with the figures column (page 1: vertical line from the header values down to the Total Value of Certified … Total Balance Due box; page 2: box around the header values and the Payment Claim column). | invoiceExcel.ts + `src/lib/sheetToHtml.ts` (print) | ✅ |
| A3 | "Add a line here" — a rule under the Site/Project row, both pages. | invoiceExcel.ts | ✅ |
| A4 | "Below the description" — Work Done sits directly under the quotation items, not half a page lower. | invoiceExcel.ts | ✅ |
| A5 | "Could u please try to remove the grey background" behind the Payment Modes / PayNow block. | `public/invoice-payment-modes.png` → block rebuilt as cells + clean QR | ✅ |

## Sheet 2 — "Invoice - 2nd Format Request" (new layout)

"We have another invoice format that we need help creating … We normally use this format for supply of materials."

| # | Ask | Status |
|---|---|---|
| B1 | A second Tax Invoice layout for **supply of materials**: header To / Attn / Tel / Site, right block INVOICE NO, GST REG NO, INVOICE DATE, **PO NO** (customer's Purchase Order), **WO NO** (our Work Order), **DO NO** (Delivery Order), **JOB REF** (= Quotation No.), PAYMENT TERMS; item table S/NO · DESCRIPTION · PRICE/UNIT · QTY · unit · TOTAL under a "Supply of Material:" subtitle; Sub-Total, GST 9%, Total Balance Due; amount in words; E.&.O.E; **PayNow QR code** (the SGQR they supplied); "computer-generated" line; Page 1 of 1. Sample: 310266/2026/04 to GA Construction, 1 set StoPox WL100 @ 180. | ✅ built — "Prepare invoice" on a Works Order (Download / Print work; **Issue** live: migration `20261102_material_invoice.sql` applied 2 Nov pm) |

## Sheet 3 — "Progress Claim > Chase" (marked-up Payment chase card, F23012 #24)

| # | Ask (their words) | Status |
|---|---|---|
| C1 | Recipient email: "Please allow editing after saving" (today the chip locks once saved). | ✅ |
| C2 | "…and separate into To: / CC: / BCC:" | ✅ UI done (`projects.chase_cc` / `chase_bcc`, migration `20261102_chase_recipients.sql` applied live 3 Nov; passed to the send webhook as `cc` / `bcc` and the n8n Gmail node now maps them) |
| C3 | Attn on the reminder draft: "Please allow edits". | ✅ (saves `claims.contact_person`) |
| C4 | "Please allow users to choose their preferred email template from these options: 1. Invoice Template 2. Standard Statement of Account (SOA) 3. 1st Reminder 4. 2nd Reminder 5. Final Reminder" | ✅ template picker on the Payment chase draft |

## Sheet 4 — "Email Templates" (their wording, verbatim)

| # | Template | Status |
|---|---|---|
| D1 | **For Invoice** — "We are pleased to submit our tax invoice for your perusal. Please be informed that we will stop printing and mailing hardcopy invoice in an effort to Go-Green w.e.f 1st November 2023. If you are unable to download the attached, please contact us @ 6753 9939 or email to accounts@conplus.com.sg. Thank you." | ✅ new key `pay.invoice` |
| D2 | **Standard SOA** — "Please refer to the attached herewith the SOA for your reference. Thank you." | ✅ already `pay.soa` |
| D3 | **1st Reminder** — "…Statement of Account… Please be informed that your account is long overdue. Kindly advise the payment of SGD XXXX.XX by [Due Date - one week later]. We would appreciate your immediate attention to this matter. Thank you." | ✅ `pay.1st` wording aligned (amount + deadline) |
| D4 | **2nd Reminder** — same text as the 1st. | ✅ `pay.2nd` |
| D5 | **Final Reminder** — "Kindly refer to the attached file for the Statement of Account as at [date]. Please be informed that your account is long OVERDUE. We will expect the full settlement of all outstanding payment SGD XXXX.XX by [Due Date - one week later]. Without prejudice to our rights, if the said payment … is not received in full by [Due Date], we will commence legal proceedings … Thank you." | ✅ `pay.final.legal` wording aligned, new `{as_at}` placeholder |

## Open questions for Accounts
- Running number for the material-supply invoice: the sample shows 310266/2026/04 while progress-claim invoices run 320016/2026/10. One series or two? Built on the shared counter until told otherwise.
- The PayNow QR in the new sheet is an SGQR (merchant "CONPLUS RESOURCES PTE LTD", UEN 199404220W). The old block used a plain PayNow-UEN code for the same UEN. Both invoices now print the SGQR.
- Amount in words on the material invoice follows the sample ("… Dollars and Twenty Cents"); the progress-claim invoice keeps its template's "… and Cents … Only". Say if both should read the same.
- Send path: the n8n send-chase workflow only reads `to` today; `cc` / `bcc` are now sent in the payload. Applied 2 Nov pm over the REST API (`docs/n8n/send_chase_cc_bcc.md`); CC/BCC still gated by GO_LIVE.
