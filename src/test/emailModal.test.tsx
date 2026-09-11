import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { EmailPreviewModal } from "@/components/ClaimsPivot";

const row = { claim_id: "x", project_code: "E25057", claim_no: 1 };
const email = { subject: "Payment Response Certificate — MOE Building (Claim 1)", body: "Dear Sir/Madam,\n\nWe refer to our Progress Claim 1." };

describe("EmailPreviewModal (Edit draft / Manual)", () => {
  it("lets the user edit subject and body and logs the EDITED text as sent", () => {
    const onProceed = vi.fn();
    render(<EmailPreviewModal row={row} clock="certificate" email={email} isManual={false} onProceed={onProceed} onIgnore={() => {}} onClose={() => {}} />);
    const subject = screen.getByLabelText("Subject") as HTMLInputElement;
    const body = screen.getByLabelText("Body") as HTMLTextAreaElement;
    expect(subject.value).toBe(email.subject);
    expect(body.value).toBe(email.body);
    fireEvent.change(subject, { target: { value: "Edited subject" } });
    fireEvent.change(body, { target: { value: "Edited body text" } });
    fireEvent.click(screen.getByRole("button", { name: "Log as Sent" }));
    expect(onProceed).toHaveBeenCalledWith("Edited subject", "Edited body text");
    expect(screen.getByRole("heading", { name: /Draft Reminder/ })).toBeTruthy();
  });

  it("Skip This Cycle records the unedited draft as the ignored text", () => {
    const onIgnore = vi.fn();
    render(<EmailPreviewModal row={row} clock="certificate" email={email} isManual={true} onProceed={() => {}} onIgnore={onIgnore} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Skip This Cycle" }));
    expect(onIgnore).toHaveBeenCalledWith(email.subject, email.body);
    expect(screen.getByRole("heading", { name: /Manual Reminder/ })).toBeTruthy();
  });

  it("explains what each action does", () => {
    render(<EmailPreviewModal row={row} clock="payment" email={email} isManual={false} onProceed={() => {}} onIgnore={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/records the text below as sent/i)).toBeTruthy();
    expect(screen.getByText(/records that no reminder was sent this cycle/i)).toBeTruthy();
    expect(screen.getByText(/Statement of Account/i)).toBeTruthy();
  });

  it("disables Log as Sent when the body is emptied", () => {
    render(<EmailPreviewModal row={row} clock="certificate" email={email} isManual={false} onProceed={() => {}} onIgnore={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Log as Sent" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
