import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { copyModule, functionsModule, parseNotificationDoc } from "../src/notifications/parse";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export const notificationPaths = {
  doc: at("../../../docs/notifications.md"),
  core: at("../src/notifications/core.ts"),
  copy: at("../src/notifications/copy.ts"),
  functions: at("../../../supabase/functions/_shared/notifications.ts"),
};

async function formatted(path: string, source: string): Promise<string> {
  const options = (await resolveConfig(path)) ?? {};
  return format(source, { ...options, filepath: path });
}

/** The two generated catalogues, from docs/notifications.md and core.ts. */
export async function notificationFiles(): Promise<{ path: string; content: string }[]> {
  const copy = parseNotificationDoc(readFileSync(notificationPaths.doc, "utf8"));
  const core = readFileSync(notificationPaths.core, "utf8");
  return [
    {
      path: notificationPaths.copy,
      content: await formatted(notificationPaths.copy, copyModule(copy)),
    },
    {
      path: notificationPaths.functions,
      content: await formatted(notificationPaths.functions, functionsModule(core, copy)),
    },
  ];
}
