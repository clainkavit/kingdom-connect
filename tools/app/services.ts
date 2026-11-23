import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AppError } from "./errors";
import { ensureDir, logsDir, repoRoot, stateDir, urls } from "./paths";

const isWindows = process.platform === "win32";
const pidsFile = join(stateDir, "pids.json");

type Pids = Partial<Record<"member" | "admin", number>>;

const readPids = (): Pids =>
  existsSync(pidsFile) ? (JSON.parse(readFileSync(pidsFile, "utf8")) as Pids) : {};
const writePids = (pids: Pids) => {
  ensureDir(stateDir);
  writeFileSync(pidsFile, JSON.stringify(pids, null, 2));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(what: string, check: () => Promise<boolean>, seconds: number, fix: string) {
  for (let waited = 0; waited < seconds; waited += 2) {
    if (await check()) return;
    await sleep(2000);
  }
  throw new AppError(`${what} did not start within ${seconds} seconds.`, fix);
}

const dockerRuns = async () =>
  spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "ignore" }).status === 0;

function dockerDesktopPath(): string | undefined {
  if (!isWindows) return undefined;
  const candidates = [
    join(process.env.LOCALAPPDATA ?? "", "Programs", "DockerDesktop", "Docker Desktop.exe"),
    join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe"),
  ];
  try {
    const cli = execSync("where.exe docker", { encoding: "utf8" }).split(/\r?\n/)[0]!.trim();
    candidates.unshift(join(dirname(cli), "..", "..", "Docker Desktop.exe"));
  } catch {
    /* docker CLI not on PATH */
  }
  return candidates.find((p) => existsSync(p));
}

async function startDocker() {
  if (await dockerRuns()) return "running";
  if (process.platform === "darwin") spawn("open", ["-a", "Docker"], { detached: true }).unref();
  else {
    const exe = dockerDesktopPath();
    if (!exe)
      throw new AppError(
        "Docker is not running and Docker Desktop was not found.",
        "Install Docker Desktop, or start your Docker engine, then run `pnpm app up` again.",
      );
    spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
  }
  await waitFor(
    "Docker",
    dockerRuns,
    240,
    "Open Docker Desktop and wait until it says the engine is running, then run `pnpm app up` again.",
  );
  return "started";
}

const supabaseRuns = () => answers(`${urls.supabase}/rest/v1/`);

const supabaseStart = () =>
  spawnSync("pnpm", ["exec", "supabase", "start"], {
    cwd: repoRoot,
    stdio: ["ignore", "inherit", "inherit"],
    shell: isWindows,
  }).status === 0;

/** Kong answers "name resolution failed" when the edge runtime container is down. */
async function functionsRun(): Promise<boolean> {
  try {
    const res = await fetch(`${urls.supabase}/functions/v1/login`, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(10_000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Docker restarts most Supabase containers by itself after a reboot, but not always the edge runtime. */
function startExitedContainers(): number {
  const ids = spawnSync(
    "docker",
    ["ps", "-a", "-q", "--filter", "name=supabase_", "--filter", "status=exited"],
    { encoding: "utf8" },
  )
    .stdout.split(/\s+/)
    .filter(Boolean);
  if (ids.length) spawnSync("docker", ["start", ...ids], { stdio: "ignore" });
  return ids.length;
}

async function startFunctions() {
  if (await functionsRun()) return;
  startExitedContainers();
  await waitFor(
    "The Supabase edge functions",
    functionsRun,
    90,
    "Run `pnpm db:stop`, then `pnpm app up` again. `docker logs supabase_edge_runtime_kingdom-connect` shows why it stopped.",
  );
}

async function startSupabase(dockerJustStarted: boolean) {
  if (dockerJustStarted)
    for (let waited = 0; waited < 90 && !(await supabaseRuns()); waited += 3) await sleep(3000);
  if (await supabaseRuns()) {
    await startFunctions();
    return dockerJustStarted ? "started" : "running";
  }
  let started = supabaseStart();
  if (!started) {
    await sleep(20_000);
    started = (await supabaseRuns()) || supabaseStart();
  }
  if (!started)
    throw new AppError(
      "`supabase start` failed.",
      "Read the output above. If containers are stuck, run `pnpm db:stop` and then `pnpm app up` again.",
    );
  await startFunctions();
  return "started";
}

const appCommands = {
  member: {
    args: [
      "--filter",
      "@kingdom-connect/member",
      "exec",
      "expo",
      "start",
      "--web",
      "--port",
      new URL(urls.member).port,
    ],
    env: { CI: "1", EXPO_PUBLIC_PHONE_SIGN_IN: "1" },
  },
  admin: {
    args: ["--filter", "@kingdom-connect/admin", "dev", "--port", new URL(urls.admin).port],
    env: {},
  },
} as const;

/** Start-Process uses ShellExecute, so the server does not inherit this process's output pipe and keep it open. */
function startHidden(app: "member" | "admin", logPath: string, env: NodeJS.ProcessEnv): number {
  const command = `pnpm ${appCommands[app].args.join(" ")} > "${logPath}" 2>&1`;
  const script = `(Start-Process -FilePath cmd.exe -ArgumentList '/d /c ${command.replace(/'/g, "''")}' -WorkingDirectory '${repoRoot}' -WindowStyle Hidden -PassThru).Id`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      env,
      encoding: "utf8",
    },
  );
  const pid = Number(result.stdout.trim());
  if (!pid)
    throw new AppError(
      `Could not start the ${app} app: ${result.stderr.trim()}`,
      `Start it by hand with \`pnpm ${app === "member" ? "member:web" : "admin"}\`, then run \`pnpm app up\` again.`,
    );
  return pid;
}

function startDetached(app: "member" | "admin", logPath: string, env: NodeJS.ProcessEnv): number {
  const child = spawn("pnpm", [...appCommands[app].args], {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: ["ignore", openSync(logPath, "w"), openSync(logPath, "a")],
  });
  child.unref();
  return child.pid!;
}

async function startApp(app: "member" | "admin") {
  if (await answers(urls[app])) return "running";
  ensureDir(logsDir);
  const logPath = join(logsDir, `${app}.log`);
  const env = { ...process.env, ...appCommands[app].env };
  writePids({
    ...readPids(),
    [app]: isWindows ? startHidden(app, logPath, env) : startDetached(app, logPath, env),
  });
  await waitFor(
    `The ${app} app`,
    () => answers(urls[app]),
    240,
    `Read .app/logs/${app}.log for the error. Run \`pnpm app down\` and then \`pnpm app up\` again.`,
  );
  return "started";
}

export async function up({ apps = true } = {}) {
  const docker = await startDocker();
  const supabase = await startSupabase(docker === "started");
  const result: Record<string, string> = { docker, supabase };
  if (apps) {
    const [member, admin] = await Promise.all([startApp("member"), startApp("admin")]);
    result.member = member;
    result.admin = admin;
  }
  return { ...result, urls };
}

export async function status() {
  return {
    docker: (await dockerRuns()) ? "running" : "stopped",
    supabase: (await supabaseRuns()) ? "running" : "stopped",
    functions: (await functionsRun()) ? "running" : "stopped",
    mailpit: (await answers(urls.mailpit)) ? "running" : "stopped",
    member: (await answers(urls.member)) ? "running" : "stopped",
    admin: (await answers(urls.admin)) ? "running" : "stopped",
    urls,
  };
}

function killTree(pid: number) {
  try {
    if (isWindows) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

/** Stops only the app servers this tool started. Docker and Supabase keep running. */
export function down() {
  const pids = readPids();
  const stopped = Object.entries(pids)
    .filter(([, pid]) => pid && killTree(pid))
    .map(([app]) => app);
  rmSync(pidsFile, { force: true });
  return { stopped, kept: ["docker", "supabase"] };
}

export async function requireRunning(app: "member" | "admin") {
  if (!(await supabaseRuns()))
    throw new AppError("The local database is not running.", "Run `pnpm app up` first.");
  if (!(await functionsRun()))
    throw new AppError(
      "The Supabase edge functions are not running, so sign-in fails with a wrong-password message.",
      "Run `pnpm app up`; it restarts the stopped container.",
    );
  if (!(await answers(urls[app])))
    throw new AppError(`The ${app} app is not running.`, "Run `pnpm app up` first.");
}
