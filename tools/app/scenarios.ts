import {
  addProfile,
  createApplication,
  createMember,
  makePoster,
  pastRatings,
  publishOpportunity,
  shortlistResponse,
} from "../../e2e/helpers";
import { type Account, rememberAccounts } from "./accounts";
import { AppError } from "./errors";

type Made = { accounts: Account[]; facts: Record<string, string> };

type Scenario = { about: string; adds: string[]; run: (stamp: number) => Promise<Made> };

const member = (name: string, username: string, email: string, role: string): Account => ({
  name,
  app: "member",
  signIn: username,
  email,
  role,
  source: "scenario",
});

export const scenarios: Record<string, Scenario> = {
  "worked-together": {
    about:
      "An Opportunity Poster and a worker one step before work references (OPP-8, S52, S53). The worker's Response is shortlisted; the poster can Mark as hired on /opportunities/<id>/responses, the worker confirms on /work, and both rate. The worker already has 2 revealed ratings, so the third shows Work references on the profile.",
    adds: [
      "Member wt-poster: Level 3 Opportunity Poster with one published Job",
      "Member wt-worker: shortlisted Response to that Job",
      "2 Members with earlier revealed ratings of wt-worker",
    ],
    run: async (stamp) => {
      const tag = String(stamp).slice(-4);
      const posterName = `wt_poster_${stamp}`;
      const workerName = `wt_worker_${stamp}`;
      const poster = await createMember(posterName);
      await addProfile(poster.id, `Asha Poster ${tag}`);
      await makePoster(poster.id, `Asha Traders ${tag}`);
      const jobTitle = `Tailor wanted ${tag}`;
      const opportunityId = await publishOpportunity(poster.id, jobTitle);
      const worker = await createMember(workerName);
      await addProfile(worker.id, `Baraka Tailor ${tag}`);
      await shortlistResponse(opportunityId, worker.id);
      const earlier: string[] = [];
      for (const n of [1, 2]) {
        const m = await createMember(`wt_earlier${n}_${stamp}`);
        await addProfile(m.id, `Earlier Client ${n} ${tag}`);
        earlier.push(m.id);
      }
      await pastRatings(worker.id, earlier, opportunityId);
      return {
        accounts: [
          member("wt-poster", posterName, poster.email, `Opportunity Poster, Asha Poster ${tag}`),
          member("wt-worker", workerName, worker.email, `Worker, Baraka Tailor ${tag}`),
        ],
        facts: {
          opportunityId,
          jobTitle,
          posterName: `Asha Poster ${tag}`,
          workerName: `Baraka Tailor ${tag}`,
          workerId: worker.id,
          responsesPage: `/opportunities/${opportunityId}/responses`,
          workerProfile: `/profile/${worker.id}`,
        },
      };
    },
  },
  "applicant-waiting": {
    about:
      "An Applicant who finished the five profile steps and sent them to staff (REG-1, REG-8, S05). Shows the Under review state, look but not act (R27), and the application in the admin verification queue.",
    adds: ["Member applicant-waiting: pending, application sent, ID and both photos recorded"],
    run: async (stamp) => {
      const username = `aw_applicant_${stamp}`;
      const { id, email } = await createApplication(username, `AW${stamp}`);
      return {
        accounts: [member("applicant-waiting", username, email, "Applicant, application sent")],
        facts: { memberId: id, username, adminQueue: "/verification", queueLink: `@${username} ·` },
      };
    },
  },
};

export async function runScenario(name: string, { dryRun = false } = {}) {
  const scenario = scenarios[name];
  if (!scenario)
    throw new AppError(
      `No scenario called "${name}".`,
      `Use one of: ${Object.keys(scenarios).join(", ")}. Run \`pnpm app scenario --list\` to see what each adds.`,
    );
  if (dryRun)
    return { scenario: name, dryRun: true, about: scenario.about, wouldAdd: scenario.adds };
  const made = await scenario.run(Date.now());
  rememberAccounts(made.accounts);
  return {
    scenario: name,
    about: scenario.about,
    added: scenario.adds,
    accounts: made.accounts.map(({ name: n, signIn, role }) => ({
      name: n,
      username: signIn,
      role,
    })),
    ...made.facts,
  };
}

export function listScenarios() {
  return Object.entries(scenarios).map(([name, s]) => ({ name, about: s.about, adds: s.adds }));
}
