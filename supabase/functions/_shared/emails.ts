import {
  type NotificationCopy,
  type NotificationLanguage,
  notificationText,
  type NotificationValues,
} from "./notifications.ts";

export type Email = { subject: string; text: string };

export function notificationEmail(
  copy: Pick<NotificationCopy, "en" | "sw">,
  language: NotificationLanguage,
  values: NotificationValues,
): Email {
  const text = notificationText(copy, language, values);
  return { subject: text.title, text: text.message };
}

export function digestEmail(
  copy: Pick<NotificationCopy, "en" | "sw">,
  language: NotificationLanguage,
  values: NotificationValues,
): Email {
  const text = notificationText(copy, language, values);
  return { subject: text.digest ?? text.title, text: text.digest ?? text.message };
}
