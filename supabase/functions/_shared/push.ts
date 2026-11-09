import {
  type NotificationCopy,
  type NotificationLanguage,
  notificationText,
  type NotificationValues,
  notificationCopy,
  opensForCode,
} from "./notifications.ts";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

export type PushRow = { kind: string; payload: Record<string, unknown> };
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: { opens: string };
};

export type PushPlan =
  | { action: "send"; messages: PushMessage[] }
  | { action: "skip"; reason: string }
  | { action: "fail"; reason: string };

function valuesOf(payload: Record<string, unknown>, platformName: string): NotificationValues {
  const values: NotificationValues = { platform_name: platformName };
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" || typeof value === "number") values[key] = value;
  }
  return values;
}

/**
 * What to push for one notification: only the kinds the catalogue marks for push, only when the master switch and
 * the category's switch are on, only to the member's tokens, and only the short push text. A new message says
 * "You have a new message" and carries no preview.
 */
export function planPush(
  row: PushRow,
  member: {
    language: NotificationLanguage;
    masterOn: boolean;
    categoryOn: boolean;
    tokens: string[];
  },
  platformName: string,
): PushPlan {
  const copy = (notificationCopy as Record<string, NotificationCopy>)[row.kind];
  if (!copy) return { action: "fail", reason: `unknown kind ${row.kind}` };
  if (!copy.push) return { action: "skip", reason: "not a push notification" };
  if (!member.masterOn) return { action: "skip", reason: "master switch off" };
  if (!member.categoryOn) return { action: "skip", reason: "category switch off" };
  if (member.tokens.length === 0) return { action: "skip", reason: "no phone registered" };
  const text = notificationText(copy, member.language, valuesOf(row.payload, platformName));
  const opens = opensForCode(row.kind);
  return {
    action: "send",
    messages: member.tokens.map((to) => ({
      to,
      title: text.title,
      body: text.push ?? text.message,
      sound: "default" as const,
      data: { opens },
    })),
  };
}

export type ExpoTicket = { status: "ok" | "error"; message?: string; details?: { error?: string } };

/** Tokens Expo says no longer belong to a phone, to be removed. */
export function deadTokens(messages: PushMessage[], tickets: ExpoTicket[]): string[] {
  return messages
    .filter(
      (_, i) =>
        tickets[i]?.status === "error" && tickets[i]?.details?.error === "DeviceNotRegistered",
    )
    .map((m) => m.to);
}

export async function sendToExpo(messages: PushMessage[]): Promise<ExpoTicket[]> {
  const res = await fetch(EXPO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw new Error(`push failed: ${res.status}`);
  const body = (await res.json()) as { data?: ExpoTicket[] };
  return body.data ?? [];
}
