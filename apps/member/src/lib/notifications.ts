import {
  notificationCopy,
  type NotificationCategory,
  type NotificationKind,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type StoredNotification = {
  id: string;
  kind: NotificationKind;
  payload: Record<string, string | number>;
  read_at: string | null;
  created_at: string;
};

const emailOnlyKinds = Object.entries(notificationCopy)
  .filter(([, copy]) => !copy.inApp)
  .map(([kind]) => kind);
const notEmailOnly = `(${emailOnlyKinds.join(",")})`;

export async function fetchNotifications(): Promise<StoredNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, payload, read_at, created_at")
    .not("kind", "in", notEmailOnly)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).filter((n) => n.kind in notificationCopy) as StoredNotification[];
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .not("kind", "in", notEmailOnly);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
}

export async function fetchEmailSwitches(): Promise<
  Partial<Record<NotificationCategory, boolean>>
> {
  const { data, error } = await supabase.from("notification_preferences").select("category, email");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.category, row.email]));
}

export async function setEmailSwitch(category: NotificationCategory, email: boolean) {
  const { data } = await supabase.auth.getSession();
  const memberId = data.session?.user.id;
  if (!memberId) return;
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ member_id: memberId, category, email }, { onConflict: "member_id,category" });
  if (error) throw error;
}

export function useUnreadCount(pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () =>
      unreadCount().then((next) => {
        if (live) setCount(next);
      });
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pathname]);
  return count;
}
