import type { EmailRecoveryRequest, EmailRecoveryResult } from "@kingdom-connect/shared";
import { loginClient, supabase } from "./supabase";

export type Recovery = {
  id: string;
  username: string;
  fullName: string;
  newEmail: string;
  digitsMatch: boolean;
  filedByStaff: boolean;
  filedByMe: boolean;
  requestedAt: Date;
  facePhotoUrl: string | null;
  idPhotoUrl: string | null;
  newPhotoUrl: string | null;
};

export type DecideRecoveryResult =
  "ok" | "already_decided" | "no_photo" | "filed_by_you" | "reason_required" | "failed";

export type RecoveriesApi = {
  pending: () => Promise<Recovery[]>;
  decide: (id: string, approve: boolean, reason: string) => Promise<DecideRecoveryResult>;
  file: (request: EmailRecoveryRequest) => Promise<EmailRecoveryResult>;
};

const LINK_SECONDS = 300;

type Row = {
  id: string;
  member_id: string;
  new_email: string;
  id_digits_match: boolean;
  photo_path: string | null;
  filed_by: string | null;
  created_at: string;
  member: {
    username: string;
    profile: { full_name: string } | null;
    requests: { documents: { kind: string; storage_path: string }[] }[];
  };
};

async function session() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export const recoveriesApi: RecoveriesApi = {
  async pending() {
    const me = (await session())?.user.id;
    const { data, error } = await supabase
      .from("email_recoveries")
      .select(
        "id, member_id, new_email, id_digits_match, photo_path, filed_by, created_at, member:members!email_recoveries_member_id_fkey(username, profile:profiles(full_name), requests:verification_requests!verification_requests_member_id_fkey(documents:verification_documents(kind, storage_path)))",
      )
      .eq("status", "pending")
      .order("created_at");
    if (error) throw error;
    const rows = data as unknown as Row[];
    const pathOf = (row: Row, kind: string) =>
      row.member.requests.flatMap((r) => r.documents).find((d) => d.kind === kind)?.storage_path;
    const paths = rows.flatMap((r) =>
      [pathOf(r, "face_photo"), pathOf(r, "id_photo"), r.photo_path].filter((p): p is string =>
        Boolean(p),
      ),
    );
    const { data: signed } = paths.length
      ? await supabase.storage.from("identity-documents").createSignedUrls(paths, LINK_SECONDS)
      : { data: [] };
    const links = new Map(
      (signed ?? []).flatMap((s) =>
        s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [],
      ),
    );
    const link = (path: string | null | undefined) => (path && links.get(path)) || null;
    return rows.map((r) => ({
      id: r.id,
      username: r.member.username,
      fullName: r.member.profile?.full_name ?? "",
      newEmail: r.new_email,
      digitsMatch: r.id_digits_match,
      filedByStaff: r.filed_by !== null,
      filedByMe: r.filed_by !== null && r.filed_by === me,
      requestedAt: new Date(r.created_at),
      facePhotoUrl: link(pathOf(r, "face_photo")),
      idPhotoUrl: link(pathOf(r, "id_photo")),
      newPhotoUrl: link(r.photo_path),
    }));
  },

  async decide(id, approve, reason) {
    const { data, error } = await supabase.rpc("decide_email_recovery", {
      recovery: id,
      approve,
      reason: reason.trim() || null,
    });
    return error ? "failed" : ((data as DecideRecoveryResult | null) ?? "failed");
  },

  async file(request) {
    return loginClient.requestEmailRecovery(request, (await session())?.access_token);
  },
};
