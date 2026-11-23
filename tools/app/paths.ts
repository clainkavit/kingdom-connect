import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const repoRoot = resolve(__dirname, "..", "..");
export const stateDir = join(repoRoot, ".app");
export const sessionsDir = join(stateDir, "sessions");
export const logsDir = join(stateDir, "logs");

export const urls = {
  member: process.env.MEMBER_URL ?? "http://localhost:8081",
  admin: process.env.ADMIN_URL ?? "http://localhost:3000",
  supabase: "http://127.0.0.1:54321",
  mailpit: "http://localhost:54324",
} as const;

function currentBranch(): string {
  try {
    return execSync("git branch --show-current", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** proof/<branch>/, where every screenshot and video lands. Gitignored. */
export function proofDir(): string {
  const dir = join(repoRoot, "proof", (currentBranch() || "detached").replace(/[\\/]/g, "-"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}
