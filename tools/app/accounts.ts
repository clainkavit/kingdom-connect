import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "./errors";
import type { AppName } from "./feature-map";
import { ensureDir, stateDir } from "./paths";

export type Account = {
  name: string;
  app: AppName;
  /** What the sign-in form takes: a username for members, an email for staff. */
  signIn: string;
  email: string;
  role: string;
  source: "seed" | "scenario";
};

const seeded: Account[] = [
  ["applicant", "test_applicant", "Applicant (pending)"],
  ["level1", "test_level1", "Level 1 Member, connected to level2"],
  ["level2", "test_level2", "Level 2 Member (Verified Business)"],
  ["level3", "test_level3", "Level 3 Member (Opportunity Poster)"],
  ["investor", "test_level1b", "Level 1 Member with the investor flag"],
  ["suspended", "test_suspended", "Suspended Member (cannot sign in)"],
].map(([name, username, role]) => ({
  name: name!,
  app: "member" as const,
  signIn: username!,
  email: `${username!.replace(/_/g, ".")}@example.test`,
  role: role!,
  source: "seed" as const,
}));

const staff: Account[] = [
  ["admin", "test.admin@example.test", "Administrator"],
  ["superadmin", "test.superadmin@example.test", "Super Administrator"],
].map(([name, email, role]) => ({
  name: name!,
  app: "admin" as const,
  signIn: email!,
  email: email!,
  role: role!,
  source: "seed" as const,
}));

const madeFile = join(stateDir, "accounts.json");

function made(): Account[] {
  if (!existsSync(madeFile)) return [];
  return JSON.parse(readFileSync(madeFile, "utf8")) as Account[];
}

export function rememberAccounts(accounts: Account[]) {
  ensureDir(stateDir);
  const byName = new Map(made().map((a) => [a.name, a]));
  for (const a of accounts) byName.set(a.name, a);
  writeFileSync(madeFile, JSON.stringify([...byName.values()], null, 2));
}

export function allAccounts(): Account[] {
  return [...seeded, ...staff, ...made()];
}

/** Finds an account by its short name, username or email. */
export function findAccount(key: string): Account {
  const k = key.toLowerCase();
  const found = allAccounts().find(
    (a) => a.name === k || a.signIn.toLowerCase() === k || a.email.toLowerCase() === k,
  );
  if (!found)
    throw new AppError(
      `No account called "${key}".`,
      "Run `pnpm app accounts` for the names, or `pnpm app scenario <name>` to make the accounts a check needs.",
    );
  return found;
}
