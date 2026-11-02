import { digestEmail, type Email, notificationEmail } from "./emails.ts";
import {
  emailWanted,
  notificationCopy,
  type NotificationCopy,
  type NotificationLanguage,
  type NotificationValues,
} from "./notifications.ts";

export const copyFor = (kind: string): NotificationCopy | undefined =>
  (notificationCopy as Record<string, NotificationCopy>)[kind];

export type OutboxRow = { kind: string; payload: Record<string, unknown> };

export type Delivery =
  { action: "send"; email: Email } | { action: "skip" } | { action: "fail"; reason: string };

function valuesOf(payload: Record<string, unknown>, platformName: string): NotificationValues {
  const values: NotificationValues = { platform_name: platformName };
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" || typeof value === "number") values[key] = value;
  }
  return values;
}

/** What to do with one queued email: the catalogue's channel, the critical rule and the member's switch. */
export function planDelivery(
  row: OutboxRow,
  member: { language: NotificationLanguage; emailSwitchedOn: boolean },
  platformName: string,
): Delivery {
  const copy = (
    notificationCopy as Record<string, (typeof notificationCopy)[keyof typeof notificationCopy]>
  )[row.kind];
  if (!copy) return { action: "fail", reason: `unknown kind ${row.kind}` };
  const values = valuesOf(row.payload, platformName);
  const isDigest = row.payload.digest === true;
  const batched = copy.email === "digest" || copy.email === "weekly";
  if (isDigest !== batched) return { action: "skip" };
  if (!emailWanted(copy, member.emailSwitchedOn)) return { action: "skip" };
  const build = isDigest ? digestEmail : notificationEmail;
  return { action: "send", email: build(copy, member.language, values) };
}
