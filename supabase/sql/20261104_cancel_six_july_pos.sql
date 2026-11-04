-- Wendy (contract@conplus.com.sg), 27 Oct + 3 Nov 2026: cancel the six July POs still "pending approval".
-- Run once in the Supabase SQL editor. Idempotent (only touches rows still pending).
update purchase_orders
   set status = 'cancelled',
       rejection_reason = 'Cancelled 4 Nov 2026 at Conplus request (contract@, emails 27 Oct and 3 Nov 2026): left pending after the PO approval step was removed'
 where po_number in ('2607-0005','2607-0011','2607-0012','2607-0015','2607-0016','2607-0017')
   and status = 'pending'
returning po_number, status;
