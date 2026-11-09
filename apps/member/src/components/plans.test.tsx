import { router } from "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Plan, PlansApi } from "../lib/plans";
import { checkStep, MyPlans, PlanScreen, ProposePlan, tanzaniaToday } from "./plans";

afterEach(cleanup);

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

const click = async (role: string, name: string) => {
  await act(async () => fireEvent.click(screen.getByRole(role, { name })));
};

const handoff = {
  id: "h1",
  kind: "handoff" as const,
  version: "1.0",
  body_en: "The platform keeps a record only.",
  body_sw: "Rekodi tu.",
  approved_at: "2026-11-01",
};

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: "p1",
  status: "pending",
  otherId: "m1",
  otherName: "Asha Mwita",
  itemTitle: "Solar dryers",
  ideaId: "i1",
  startedByMe: false,
  milestones: 2,
  confirmed: 0,
  expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  stage1AgreedAt: null,
  closedByMe: null,
  closedAt: null,
  endedReason: null,
  milestoneList: [
    {
      id: "s1",
      position: 1,
      title: "Agreed in principle",
      description: "",
      targetDate: "2026-11-07",
      responsibleIsMe: false,
      status: "open",
    },
    {
      id: "s2",
      position: 2,
      title: "Build the first dryer",
      description: "One farm",
      targetDate: "2026-12-07",
      responsibleIsMe: true,
      status: "open",
    },
  ],
  ...over,
});

const fakeApi = (over: Partial<PlansApi> = {}): PlansApi => ({
  mine: vi.fn().mockResolvedValue([]),
  load: vi.fn().mockResolvedValue(plan()),
  partners: vi
    .fn()
    .mockResolvedValue([
      { ideaId: "i1", ideaTitle: "Solar dryers", otherId: "m1", otherName: "Asha Mwita" },
    ]),
  handoff: vi.fn().mockResolvedValue(handoff),
  propose: vi.fn().mockResolvedValue({ result: "ok", planId: "p9" }),
  restart: vi.fn().mockResolvedValue({ result: "ok", planId: "p10" }),
  accept: vi.fn().mockResolvedValue("ok"),
  withdraw: vi.fn().mockResolvedValue("ok"),
  markDone: vi.fn().mockResolvedValue("ok"),
  confirm: vi.fn().mockResolvedValue("ok"),
  end: vi.fn().mockResolvedValue("ok"),
  documents: vi.fn().mockResolvedValue({ list: [], canUpload: true }),
  pickPdf: vi.fn().mockResolvedValue(null),
  upload: vi.fn().mockResolvedValue("ok"),
  documentUrl: vi.fn().mockResolvedValue("https://files.test/signed"),
  ...over,
});

describe("checkStep", () => {
  it("needs a title and a target date from today", () => {
    const today = tanzaniaToday(new Date("2026-11-07T22:30:00Z"));
    expect(today).toBe("2026-11-08");
    const step = {
      title: "Build",
      description: "",
      targetDate: "2026-11-08",
      responsible: "me" as const,
    };
    expect(checkStep(step, today)).toBeNull();
    expect(checkStep({ ...step, title: "B" }, today)).toBe("title");
    expect(checkStep({ ...step, targetDate: "2026-11-07" }, today)).toBe("date");
    expect(checkStep({ ...step, targetDate: "8 Nov" }, today)).toBe("date");
  });
});

describe("MyPlans (S30)", () => {
  it("says how a plan starts when there is none", async () => {
    await show(<MyPlans api={fakeApi()} />);
    expect(
      screen.getByText("A plan starts from a connection made through an idea or opportunity."),
    ).toBeTruthy();
  });
});

describe("ProposePlan (S31)", () => {
  it("sends the stages after the disclaimer is accepted", async () => {
    const api = fakeApi();
    await show(<ProposePlan api={api} ideaId="i1" otherId={null} />);
    fireEvent.change(screen.getByLabelText("What will be done"), {
      target: { value: "Build the first dryer" },
    });
    fireEvent.change(screen.getByLabelText("Target date (YYYY-MM-DD)"), {
      target: { value: "2099-01-31" },
    });
    await click("radio", "The other member");
    await click("checkbox", screen.getByRole("checkbox").getAttribute("aria-label") ?? "");
    await click("button", "Accept and send the plan");
    expect(api.propose).toHaveBeenCalledWith(
      "i1",
      "m1",
      [
        {
          title: "Build the first dryer",
          description: "",
          targetDate: "2099-01-31",
          responsible: "other",
        },
      ],
      "h1",
    );
    expect(router.pushed).toContain("/plans/p9");
  });

  it("stops a past target date before sending", async () => {
    const api = fakeApi();
    await show(<ProposePlan api={api} ideaId="i1" otherId="m1" />);
    fireEvent.change(screen.getByLabelText("What will be done"), { target: { value: "Build" } });
    fireEvent.change(screen.getByLabelText("Target date (YYYY-MM-DD)"), {
      target: { value: "2020-01-01" },
    });
    await click("checkbox", screen.getByRole("checkbox").getAttribute("aria-label") ?? "");
    await click("button", "Accept and send the plan");
    expect(api.propose).not.toHaveBeenCalled();
    expect(
      screen.getByText("Give each stage a target date, today or later, as YYYY-MM-DD."),
    ).toBeTruthy();
  });
});

describe("PlanScreen (S32)", () => {
  it("lets the other member accept with the disclaimer and a countdown", async () => {
    const api = fakeApi();
    await show(<PlanScreen api={api} planId="p1" />);
    expect(screen.getByText("This plan expires in 10 days.")).toBeTruthy();
    expect(screen.getByText("Stage 1: Agreed in principle")).toBeTruthy();
    expect(screen.getByText("The platform keeps a record only.")).toBeTruthy();
    await click("checkbox", screen.getByRole("checkbox").getAttribute("aria-label") ?? "");
    await click("button", "Accept the plan");
    expect(api.accept).toHaveBeenCalledWith("p1", "h1");
  });

  it("lets the proposer withdraw while it waits", async () => {
    const api = fakeApi({ load: vi.fn().mockResolvedValue(plan({ startedByMe: true })) });
    await show(<PlanScreen api={api} planId="p1" />);
    expect(screen.getByText("Waiting for Asha Mwita. 10 days left.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept the plan" })).toBeNull();
    await click("button", "Withdraw");
    await click("button", "Withdraw");
    expect(api.withdraw).toHaveBeenCalledWith("p1");
  });

  it("offers to start an expired plan again", async () => {
    const api = fakeApi({ load: vi.fn().mockResolvedValue(plan({ status: "lapsed" })) });
    await show(<PlanScreen api={api} planId="p1" />);
    expect(screen.getByText("This plan expired. You can start it again.")).toBeTruthy();
    await click("checkbox", screen.getByRole("checkbox").getAttribute("aria-label") ?? "");
    await click("button", "Start it again");
    expect(api.restart).toHaveBeenCalledWith("p1", "h1");
    expect(router.pushed).toContain("/plans/p10");
  });
});

describe("PlanScreen (S33)", () => {
  const active = (agreedMinutesAgo: number, over: Partial<Plan> = {}) =>
    plan({
      status: "active",
      stage1AgreedAt: new Date(Date.now() - agreedMinutesAgo * 60000).toISOString(),
      ...over,
    });

  it("offers Withdraw in the first hour, and marks a stage done", async () => {
    const api = fakeApi({ load: vi.fn().mockResolvedValue(active(20)) });
    await show(<PlanScreen api={api} planId="p1" />);
    expect(screen.getByText("You can withdraw for 40 more minutes.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End plan" })).toBeNull();
    await click("button", "Mark as done");
    expect(api.markDone).toHaveBeenCalledWith("s2");
  });

  it("lets the other member confirm a stage marked done", async () => {
    const done = active(90);
    done.milestoneList = done.milestoneList.map((m) =>
      m.position === 2 ? { ...m, responsibleIsMe: false, status: "done" as const } : m,
    );
    const api = fakeApi({ load: vi.fn().mockResolvedValue(done) });
    await show(<PlanScreen api={api} planId="p1" />);
    expect(screen.queryByRole("button", { name: "Mark as done" })).toBeNull();
    await click("button", "Confirm it is done");
    expect(api.confirm).toHaveBeenCalledWith("s2");
  });

  it("ends the plan after the first hour only with a reason", async () => {
    const api = fakeApi({ load: vi.fn().mockResolvedValue(active(90)) });
    await show(<PlanScreen api={api} planId="p1" />);
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
    await click("button", "End plan");
    await click("button", "End the plan");
    expect(api.end).not.toHaveBeenCalled();
    expect(screen.getByText("Give a reason of at least 3 characters.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Why are you ending it?"), {
      target: { value: "The funding fell through" },
    });
    await click("button", "End the plan");
    expect(api.end).toHaveBeenCalledWith("p1", "The funding fell through");
  });

  it("shows an ended plan read-only, with who, when and why", async () => {
    const ended = plan({
      status: "ended",
      stage1AgreedAt: "2026-11-01T09:00:00Z",
      closedByMe: false,
      closedAt: "2026-11-05T09:00:00Z",
      endedReason: "The funding fell through",
    });
    await show(
      <PlanScreen api={fakeApi({ load: vi.fn().mockResolvedValue(ended) })} planId="p1" />,
    );
    expect(
      screen.getByText(/^Ended by Asha Mwita on .+\. Reason: The funding fell through$/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as done" })).toBeNull();
    expect(screen.queryByRole("button", { name: "End plan" })).toBeNull();
  });
});

describe("SignedAgreement (S34)", () => {
  const allConfirmed = () => {
    const p = plan({ status: "active", stage1AgreedAt: "2026-11-01T09:00:00Z" });
    p.milestoneList = p.milestoneList.map((m) => ({ ...m, status: "confirmed" as const }));
    return p;
  };

  it("appears only once every stage is confirmed", async () => {
    await show(
      <PlanScreen
        api={fakeApi({ load: vi.fn().mockResolvedValue(plan({ status: "active" })) })}
        planId="p1"
      />,
    );
    expect(screen.queryByText("Signed agreement")).toBeNull();
  });

  it("states a wrong file before sending, then uploads a PDF", async () => {
    const pickPdf = vi.fn().mockResolvedValue({
      uri: "file:///big.pdf",
      name: "big.pdf",
      mime: "application/pdf",
      size: 11 * 1024 * 1024,
    });
    const api = fakeApi({ load: vi.fn().mockResolvedValue(allConfirmed()), pickPdf });
    await show(<PlanScreen api={api} planId="p1" />);
    expect(screen.getByText("Asha Mwita hasn't uploaded theirs yet.")).toBeTruthy();
    await click("button", "Upload my signed agreement");
    expect(screen.getByText("The file is larger than 10 MB.")).toBeTruthy();
    expect(api.upload).not.toHaveBeenCalled();
    pickPdf.mockResolvedValue({
      uri: "file:///a.pdf",
      name: "a.pdf",
      mime: "application/pdf",
      size: 1000,
    });
    await click("button", "Upload my signed agreement");
    expect(api.upload).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "a.pdf" }));
  });
});
