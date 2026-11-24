import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { enterCode, logIn, nextCode } from "../../e2e/helpers";
import { type Account, findAccount } from "./accounts";
import { AppError } from "./errors";
import type { AppName } from "./feature-map";
import { ensureDir, proofDir, sessionsDir, urls } from "./paths";
import { requireRunning } from "./services";

export type Device = "phone" | "desktop";

const viewports: Record<Device, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1366, height: 900 },
};

export const defaultDevice = (app: AppName): Device => (app === "member" ? "phone" : "desktop");

const signedOutPaths = ["/login", "/welcome", "/verify", "/sign-up"];

const sessionFile = (account: Account) =>
  join(sessionsDir, `${account.signIn.replace(/[^a-zA-Z0-9_.-]/g, "_")}.json`);

export type OpenOptions = { device?: Device; video?: boolean };

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** One browser for a command, with a context per person so several people can act in one check. */
export class Session {
  private contexts: { context: BrowserContext; label: string }[] = [];
  private shots = 0;
  readonly files: string[] = [];

  private constructor(
    private browser: Browser,
    private dir: string,
    private prefix: string,
  ) {}

  static async start(prefix: string): Promise<Session> {
    const browser = await chromium.launch();
    return new Session(browser, proofDir(), slug(prefix));
  }

  private async context(app: AppName, label: string, opts: OpenOptions, storage?: string) {
    const viewport = viewports[opts.device ?? defaultDevice(app)];
    const context = await this.browser.newContext({
      baseURL: urls[app],
      viewport,
      storageState: storage && existsSync(storage) ? storage : undefined,
      recordVideo: opts.video
        ? { dir: ensureDir(join(this.dir, ".video")), size: viewport }
        : undefined,
    });
    context.setDefaultTimeout(20_000);
    const same = this.contexts.filter((c) => c.label === label || c.label.startsWith(`${label}-`));
    this.contexts.push({ context, label: same.length ? `${label}-${same.length + 1}` : label });
    return context;
  }

  /** A page for someone who is not signed in. */
  async guest(app: AppName, opts: OpenOptions = {}): Promise<Page> {
    await requireRunning(app);
    const context = await this.context(app, `guest-${app}`, opts);
    return context.newPage();
  }

  /** A page signed in as the account, reusing its saved sign-in when it still works. */
  async as(name: string, opts: OpenOptions = {}): Promise<Page> {
    const account = findAccount(name);
    await requireRunning(account.app);
    const context = await this.context(account.app, account.name, opts, sessionFile(account));
    const page = await context.newPage();
    if (!existsSync(sessionFile(account)) || (await looksSignedOut(page))) {
      await signIn(page, account);
      ensureDir(sessionsDir);
      await context.storageState({ path: sessionFile(account) });
    }
    return page;
  }

  /** Saves a screenshot of the page as the next numbered proof file. */
  async step(page: Page, name: string, { full = false } = {}): Promise<string> {
    await page.waitForLoadState("networkidle").catch(() => undefined);
    this.shots += 1;
    const file = join(
      this.dir,
      `${this.prefix}-${String(this.shots).padStart(2, "0")}-${slug(name)}.png`,
    );
    await page.screenshot({ path: file, fullPage: full });
    this.files.push(file);
    return file;
  }

  /** A screenshot of every open page, named after the person, to show where a failed check stopped. */
  async failureShots(): Promise<void> {
    for (const { context, label } of this.contexts)
      for (const [i, page] of context.pages().entries()) {
        const file = join(this.dir, `${this.prefix}-failed-${label}${i ? `-${i + 1}` : ""}.png`);
        await page.screenshot({ path: file }).catch(() => undefined);
        this.files.push(file);
      }
  }

  async close(): Promise<void> {
    for (const { context, label } of this.contexts) {
      const videos = context.pages().map((p) => p.video());
      await context.close();
      for (const [i, video] of videos.entries()) {
        if (!video) continue;
        const target = join(this.dir, `${this.prefix}-${label}${i ? `-${i + 1}` : ""}.webm`);
        rmSync(target, { force: true });
        renameSync(await video.path(), target);
        this.files.push(target);
      }
    }
    await this.browser.close();
  }
}

/** Signed-out visitors see the welcome page at `/` without a redirect, so look for the Log in control too. */
async function looksSignedOut(page: Page): Promise<boolean> {
  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  if (signedOutPaths.some((p) => new URL(page.url()).pathname.startsWith(p))) return true;
  return page
    .getByRole("link", { name: /^(Log in|Ingia)$/ })
    .or(page.getByRole("button", { name: /^(Log in|Ingia)$/ }))
    .first()
    .isVisible();
}

async function signIn(page: Page, account: Account) {
  if (account.source === "seed" && account.name === "suspended")
    throw new AppError(
      "The suspended account cannot sign in.",
      "Use `guest` and type its username on /login to show the refusal.",
    );
  await page.goto("/login");
  const sentAfter = new Date();
  await logIn(page, account.app === "admin" ? "Email" : "Username", account.signIn);
  await enterCode(page, await nextCode(account.email, sentAfter));
  try {
    await page.waitForURL((url) => !signedOutPaths.some((p) => url.pathname.startsWith(p)), {
      timeout: 30_000,
    });
  } catch {
    throw new AppError(
      `Signing in as ${account.name} did not leave ${new URL(page.url()).pathname}.`,
      "Check the account is not locked (five wrong passwords lock it for 15 minutes, `pnpm app reset` clears locks) and that the email code arrived in Mailpit at http://localhost:54324.",
    );
  }
}
