/** A16 staff accounts: a Super Administrator invites Administrators. PRD section 3 and section 6, criterion 15. */
import { functionCaller, type FunctionOptions } from "./auth";

export const staffRoles = ["admin", "super_admin"] as const;
export type StaffRole = (typeof staffRoles)[number];

export type NewStaff = { fullName: string; email: string; role: StaffRole };
export type InviteResult = "done" | "email_taken" | "invalid" | "failed";

export function createStaffClient(options: FunctionOptions) {
  const call = functionCaller(options);
  return {
    async invite(accessToken: string, staff: NewStaff): Promise<InviteResult> {
      const r = await call("create-staff", staff, accessToken);
      if (r?.ok) return "done";
      if (r?.error === "email_taken" || r?.error === "invalid") return r.error;
      return "failed";
    },
  };
}
