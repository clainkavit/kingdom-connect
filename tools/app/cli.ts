import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { acceptCurrentTexts, LOCAL_SERVICE_ROLE_KEY } from "../../e2e/helpers";
import { allAccounts, findAccount } from "./accounts";
import { type Device, Session } from "./browser";
import { type Check, emailCode } from "./check";
import { AppError } from "./errors";
import { type AppName, readFeatureMap } from "./feature-map";
import { proofDir, repoRoot, sessionsDir, stateDir, urls } from "./paths";
import { listScenarios, runScenario } from "./scenarios";
import { down, status, up } from "./services";

const help = `pnpm app <command> [options]

Launches and drives Kingdom Connect locally (web only) and saves proof to proof/<branch>/.
Every command prints JSON. On failure it prints {"ok": false, "error", "fix"} and exits 1.

Commands
  up [--no-apps]          Start Docker Desktop, the local Supabase stack (with Mailpit) and both apps.
                          Reuses whatever already runs. Accepts the current terms for seeded members.
  status                  Show what is running and the URLs.
  down                    Stop the app servers \`up\` started. Docker and Supabase keep running.
  accounts                List every account you can sign in as (seeded, and those scenarios made).
  scenario <name>         Add fresh fake members in a state the seed lacks. Never deletes data.
      --dry-run           Say what it would add, add nothing.
      --list              List the scenarios.
  shot <route>            Open a screen and save a screenshot.
      --as <account>      Signed in as this account (its app is implied).
      --guest <app>       Signed out, in "member" or "admin".
      --device <d>        "phone" (default for member) or "desktop" (default for admin).
      --full              Whole page, not only the screen.
      --name <text>       File name part. Default: the route.
  check <file.ts>         Run a check script (see tools/app/checks/) and save its screenshots.
      --video             Also record a .webm video per person.
  map [text]              Feature Map rows (docs/feature-map.md), filtered by route, screen or words.
  reset                   Rebuild the local database from migrations and the seed. Deletes all local data.
      --dry-run           Say what it would do.
      --yes               Required to really reset.

Examples
  pnpm app up
  pnpm app shot /work --as level1
  pnpm app shot /verification --as superadmin --full
  pnpm app scenario worked-together
  pnpm app check tools/app/checks/work-references.ts --video
  pnpm app map verification
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    as: { type: "string" },
    guest: { type: "string" },
    device: { type: "string" },
    name: { type: "string" },
    full: { type: "boolean", default: false },
    video: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    list: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    "no-apps": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [command, arg] = positionals;

function asApp(value: string | undefined): AppName {
  if (value === "member" || value === "admin") return value;
  throw new AppError(`"${value}" is not an app.`, 'Use "member" or "admin".');
}

function asDevice(value: string | undefined): Device | undefined {
  if (value === undefined || value === "phone" || value === "desktop") return value;
  throw new AppError(`"${value}" is not a device.`, 'Use "phone" or "desktop".');
}

async function acceptTextsForSeed() {
  const members: { id: string }[] = await fetch(
    `${urls.supabase}/rest/v1/members?status=eq.approved&select=id`,
    {
      headers: {
        apikey: LOCAL_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      },
    },
  ).then((r) => r.json());
  await acceptCurrentTexts(members.map((m) => m.id));
}

async function shot(route: string | undefined) {
  if (!route?.startsWith("/"))
    throw new AppError("shot needs a route such as /work.", "Run `pnpm app map` to find routes.");
  if (!values.as && !values.guest)
    throw new AppError(
      "shot needs --as <account> or --guest <app>.",
      "Run `pnpm app accounts` for the names.",
    );
  const device = asDevice(values.device);
  const session = await Session.start(values.name ?? `shot${route}`);
  try {
    const page = values.as
      ? await session.as(values.as, { device })
      : await session.guest(asApp(values.guest), { device });
    await page.goto(route);
    const file = await session.step(page, route === "/" ? "home" : route, { full: values.full });
    return { url: page.url(), title: await page.title(), file };
  } finally {
    await session.close();
  }
}

async function check(file: string | undefined) {
  if (!file)
    throw new AppError("check needs a script file.", "See tools/app/checks/ for examples.");
  const path = resolve(process.cwd(), file);
  const mod = (await import(pathToFileURL(path).href)) as { default?: Check };
  if (typeof mod.default !== "function")
    throw new AppError(
      `${file} has no default export.`,
      "Export `defineCheck(async ({ as, guest, step }) => { ... })` as the default.",
    );
  const name = path.replace(/\\/g, "/").split("/").pop()!.replace(/\.ts$/, "");
  const session = await Session.start(name);
  const notes: string[] = [];
  const opts = (o?: { device?: Device; video?: boolean }) => ({ video: values.video, ...o });
  let failure: unknown;
  try {
    await mod.default({
      as: (account, o) => session.as(account, opts(o)),
      guest: (app, o) => session.guest(app, opts(o)),
      step: (page, stepName, o) => session.step(page, stepName, o),
      scenario: runScenario,
      emailCode,
      note: (text) => notes.push(text),
    });
  } catch (error) {
    failure = error;
    await session.failureShots();
  }
  await session.close();
  if (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    throw new AppError(
      `The check failed: ${message
        .replace(/\u001b\[[0-9;]*m/g, "")
        .split("\n")
        .filter((l) => /\S/.test(l) && !/^\s+at /.test(l))
        .slice(0, 6)
        .join(" | ")}`,
      `Open the *-failed-*.png files and the videos in ${proofDir()} to see where it stopped. Files: ${session.files.join(", ") || "none"}`,
    );
  }
  return { check: name, notes, files: session.files };
}

function reset() {
  const plan = {
    runs: "pnpm db:reset (supabase db reset, then pnpm legal:load)",
    deletes: "every row in the local database, then loads supabase/seed.sql again",
    alsoClears: [".app/sessions", ".app/accounts.json"],
  };
  if (values["dry-run"] || !values.yes)
    return {
      dryRun: true,
      ...plan,
      fix: values.yes ? undefined : "Add --yes to really reset. This cannot be undone.",
    };
  const result = spawnSync("pnpm", ["db:reset"], {
    cwd: repoRoot,
    stdio: ["ignore", "inherit", "inherit"],
    shell: process.platform === "win32",
  });
  if (result.status !== 0)
    throw new AppError("pnpm db:reset failed.", "Read the output above. Is `pnpm app up` done?");
  rmSync(sessionsDir, { recursive: true, force: true });
  rmSync(`${stateDir}/accounts.json`, { force: true });
  return { reset: true, ...plan };
}

function map(text: string | undefined) {
  const rows = readFeatureMap(repoRoot);
  if (!text) return rows;
  const t = text.toLowerCase();
  return rows.filter((r) => Object.values(r).some((v) => v.toLowerCase().includes(t)));
}

async function main(): Promise<unknown> {
  switch (command) {
    case "up": {
      const result = await up({ apps: !values["no-apps"] });
      await acceptTextsForSeed();
      return result;
    }
    case "status":
      return status();
    case "down":
      return down();
    case "accounts":
      return allAccounts().map(({ name, app, signIn, role, source }) => ({
        name,
        app,
        signIn,
        role,
        source,
      }));
    case "scenario":
      if (values.list || !arg) return listScenarios();
      return runScenario(arg, { dryRun: values["dry-run"] });
    case "shot":
      return shot(arg);
    case "check":
      return check(arg);
    case "map":
      return map(arg);
    case "reset":
      return reset();
    case "whois":
      return findAccount(arg ?? "");
    default:
      throw new AppError(
        command ? `Unknown command "${command}".` : "No command given.",
        "Run `pnpm app --help`.",
      );
  }
}

if (values.help || !command) {
  process.stdout.write(help);
  process.exit(0);
}

function finish(code: number, out: unknown) {
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1000).unref();
}

main().then(
  (result) => finish(0, { ok: true, result }),
  (error: unknown) =>
    finish(
      1,
      error instanceof AppError
        ? { ok: false, error: error.message, fix: error.fix }
        : { ok: false, error: error instanceof Error ? error.message : String(error), fix: "" },
    ),
);
