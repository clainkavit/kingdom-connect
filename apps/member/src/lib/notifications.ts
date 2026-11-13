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

/** R24: conversations with a message the member has not read yet. */
export async function unreadThreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc("unread_thread_count");
  if (error) return 0;
  return (data as number | null) ?? 0;
}

const readListeners = new Set<() => void>();

/** Tells the Messages count that a thread was just read, so it does not wait for its next refresh. */
export function threadRead(): void {
  readListeners.forEach((listener) => listener());
}

/** Unread messages, refreshed every minute, on each screen change and whenever a thread is read. */
export function useUnreadMessages(pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () =>
      unreadThreadCount().then((next) => {
        if (live) setCount(next);
      });
    load();
    const timer = setInterval(load, 60_000);
    readListeners.add(load);
    return () => {
      live = false;
      clearInterval(timer);
      readListeners.delete(load);
    };
  }, [pathname]);
  return count;
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
