import { expect as baseExpect, type Page } from "@playwright/test";
import { nextCode } from "../../e2e/helpers";
import type { OpenOptions } from "./browser";
import type { AppName } from "./feature-map";
import { runScenario } from "./scenarios";

export type CheckTools = {
  /** A page signed in as an account from `pnpm app accounts`, or one a scenario made. */
  as: (account: string, opts?: OpenOptions) => Promise<Page>;
  /** A page for someone not signed in. */
  guest: (app: AppName, opts?: OpenOptions) => Promise<Page>;
  /** Saves a numbered screenshot as proof. */
  step: (page: Page, name: string, opts?: { full?: boolean }) => Promise<string>;
  /** Adds the scenario's accounts and returns what it made. */
  scenario: typeof runScenario;
  /** The 6-digit email code sent to the address after the given time, read from Mailpit. */
  emailCode: (email: string, sentAfter: Date) => Promise<string>;
  /** Writes a line to the check's report. */
  note: (text: string) => void;
};

export type Check = (tools: CheckTools) => Promise<void>;

export function defineCheck(check: Check): Check {
  return check;
}

export const emailCode = nextCode;

/** Playwright's expect with the waiting time the e2e tests use. Import this one in checks. */
export const expect = baseExpect.configure({ timeout: 20_000 });
