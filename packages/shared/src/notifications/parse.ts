import {
  categoryOfCode,
  opensForCode,
  type EmailChannel,
  type NotificationCopy,
  type NotificationText,
} from "./core";

const trimStop = (text: string) => text.trim().replace(/\.$/, "");

function parseText(line: string): NotificationText {
  const body = line.replace(/^- \*\*(EN|SW)\*\* /, "");
  if (body.startsWith("In-app:")) {
    const [, inApp, push, digest] = body.match(/^In-app: (.*?) Push: (.*?) Email digest: (.*)$/)!;
    return { title: trimStop(inApp!), message: "", push: push!.trim(), digest: digest!.trim() };
  }
  const match = body.match(/^Title: (.*?) Message: (.*)$/);
  if (!match) throw new Error(`Cannot read notification copy: ${line}`);
  return { title: trimStop(match[1]!), message: match[2]!.trim() };
}

function parseChannels(line: string): Pick<NotificationCopy, "inApp" | "email" | "push"> {
  const channels = line.replace(/^.*Channels: /, "").split(".")[0]!;
  const email: EmailChannel = channels.includes("weekly email digest")
    ? "weekly"
    : channels.includes("email digest")
      ? "digest"
      : channels.includes("email")
        ? "yes"
        : "no";
  return { inApp: channels.includes("in-app"), email, push: channels.includes("push") };
}

/** Reads every event in docs/notifications.md into catalogue entries keyed by code (A1, C3...). */
export function parseNotificationDoc(markdown: string): Record<string, NotificationCopy> {
  const copy: Record<string, NotificationCopy> = {};
  const sections = markdown.split(/^### /m).slice(1);
  for (const section of sections) {
    const lines = section.split(/\r?\n/);
    const code = lines[0]!.split(" ")[0]!;
    const to = lines.find((l) => l.startsWith("To:"));
    const en = lines.find((l) => l.startsWith("- **EN**"));
    const sw = lines.find((l) => l.startsWith("- **SW**"));
    if (!to || !en || !sw) throw new Error(`Notification ${code} is missing To, EN or SW`);
    copy[code] = {
      category: categoryOfCode(code),
      ...parseChannels(to),
      opens: opensForCode(code),
      en: parseText(en),
      sw: parseText(sw),
    };
  }
  return copy;
}

export function copyModule(copy: Record<string, NotificationCopy>): string {
  return [
    'import type { NotificationCopy } from "./core";',
    "",
    `export const notificationCopy = ${JSON.stringify(copy, null, 2)} satisfies Record<string, NotificationCopy>;`,
    "",
    "export type NotificationKind = keyof typeof notificationCopy;",
    "",
  ].join("\n");
}

/** One self-contained file for the Edge Functions, which cannot import from packages/shared. */
export function functionsModule(core: string, copy: Record<string, NotificationCopy>): string {
  return [core.trimEnd(), "", copyModule(copy).replace(/^import type .*\n\n/, "")].join("\n");
}
