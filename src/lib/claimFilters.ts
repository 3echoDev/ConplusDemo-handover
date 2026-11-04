/**
 * Which date the Live View claim filters compare against.
 *
 * `claims.submitted_date` is null on almost every row (it is only stamped when a
 * claim is formally submitted), and `mapClaim` turns that null into the display
 * placeholder "—". Comparing that placeholder against an ISO range silently
 * excluded every claim, so the Progress Claims and Conplus Invoices sections
 * read "No progress claims on record yet" while the KPI above them counted 158.
 *
 * The claim's own `claim_date` is the field that is actually populated, so it is
 * the one to filter on; a real submitted date is kept as a fallback.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function claimFilterDate(
  claim: { claimDate?: string | null; submittedDate?: string | null },
): string {
  const claimDate = claim.claimDate ?? "";
  if (ISO_DATE.test(claimDate)) return claimDate.slice(0, 10);
  const submitted = claim.submittedDate ?? "";
  if (ISO_DATE.test(submitted)) return submitted.slice(0, 10);
  return "";
}
