/** A16 staff accounts: a Super Administrator invites Administrators. PRD section 3 and section 6, criterion 15. */
import { functionCaller, type FunctionOptions } from "./auth";

export const staffRoles = ["admin", "super_admin"] as const;
export type StaffRole = (typeof staffRoles)[number];

export type NewStaff = { fullName: string; email: string; role: StaffRole };
export type InviteResult = "done" | "email_taken" | "invalid" | "failed";

export type StaffAccessAction = "send_link" | "refuse" | "unlock";
export type StaffAccessResult = "done" | "own_request" | "gone" | "failed";
export type ResetLinkCheck =
  { kind: "ok"; email: string } | { kind: "expired" } | { kind: "failed" };
export type FinishResetResult = "done" | "expired" | "weak_password" | "failed";

export function createStaffClient(options: FunctionOptions) {
  const call = functionCaller(options);
  return {
    async invite(accessToken: string, staff: NewStaff): Promise<InviteResult> {
      const r = await call("create-staff", staff, accessToken);
      if (r?.ok) return "done";
      if (r?.error === "email_taken" || r?.error === "invalid") return r.error;
      return "failed";
    },

    /** R30 Admin-Forgot: always answers the same, so it never says whether the email is a staff account. */
    async requestReset(email: string): Promise<boolean> {
      return (await call("staff-reset-request", { email }))?.ok === true;
    },

    async decide(
      accessToken: string,
      action: StaffAccessAction,
      id: string,
    ): Promise<StaffAccessResult> {
      const r = await call("staff-access", { action, id }, accessToken);
      if (r?.ok) return "done";
      if (r?.error === "own_request") return "own_request";
      if (r?.error === "not_found") return "gone";
      return "failed";
    },

    async checkResetLink(id: string, token: string): Promise<ResetLinkCheck> {
      const r = await call("staff-reset-finish", { id, token });
      if (typeof r?.email === "string") return { kind: "ok", email: r.email };
      return r?.error === "expired" ? { kind: "expired" } : { kind: "failed" };
    },

    async finishReset(id: string, token: string, password: string): Promise<FinishResetResult> {
      const r = await call("staff-reset-finish", { id, token, password });
      if (r?.ok) return "done";
      if (r?.error === "expired" || r?.error === "weak_password") return r.error;
      return "failed";
    },
  };
}
