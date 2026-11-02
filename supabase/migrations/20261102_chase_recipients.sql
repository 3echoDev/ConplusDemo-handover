-- Chase recipients: To / CC / BCC per project (Accounts, "Account - Invoice.xlsx",
-- sheet "Progress Claim > Chase", 2 Nov 2026: "separate into To: / CC: / BCC:").
--
-- To stays projects.contact_email (the certificate_chase / payment_chase views
-- already carry it). CC and BCC are new, comma-separated lists, read by the
-- Chase page straight from projects and passed to the send-chase webhook as
-- `cc` / `bcc`. Additive, nullable: nothing else changes.

alter table public.projects
  add column if not exists chase_cc  text,
  add column if not exists chase_bcc text;

comment on column public.projects.chase_cc  is 'Chase emails: CC recipients, comma-separated';
comment on column public.projects.chase_bcc is 'Chase emails: BCC recipients, comma-separated';
