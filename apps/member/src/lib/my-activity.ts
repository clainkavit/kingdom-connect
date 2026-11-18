import { myId, supabase } from "./supabase";

export type MyActivity = {
  applications: number;
  ideaRequests: number;
  latestApplication: { title: string; status: string } | null;
};

/** S08 My activity: the member's own counts (never platform-wide figures, PRD section 7). */
export async function loadMyActivity(): Promise<MyActivity> {
  const [responses, id] = await Promise.all([supabase.rpc("my_responses"), myId()]);
  const rows = (responses.data ?? []) as { title: string; status: string; created_at: string }[];
  const ideas = id
    ? await supabase
        .from("idea_access_requests")
        .select("id", { count: "exact", head: true })
        .eq("requester_id", id)
    : { count: 0 };
  const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return {
    applications: rows.length,
    ideaRequests: ideas.count ?? 0,
    latestApplication: latest ? { title: latest.title, status: latest.status } : null,
  };
}
