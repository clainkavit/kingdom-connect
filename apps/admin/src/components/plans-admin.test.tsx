import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminPlan, PlansAdminApi } from "@/lib/plans";
import { PlansAdminScreen } from "./plans-admin";

afterEach(cleanup);

const plan: AdminPlan = {
  id: "p1",
  status: "ended",
  memberA: "Asha Mwita",
  memberB: "Baraka Mtaji",
  startedBy: "Baraka Mtaji",
  item: "Solar dryers",
  milestones: 2,
  confirmed: 1,
  createdAt: new Date("2026-11-01T09:00:00+03:00"),
  closedAt: new Date("2026-11-05T09:00:00+03:00"),
  annotations: 0,
};

const fakeApi = (over: Partial<PlansAdminApi> = {}): PlansAdminApi => ({
  plans: vi.fn().mockResolvedValue([plan]),
  stages: vi.fn().mockResolvedValue([
    {
      position: 1,
      title: "Agreed in principle",
      description: "",
      targetDate: "2026-11-01",
      responsible: "Baraka Mtaji",
      status: "confirmed",
    },
    {
      position: 2,
      title: "First investment",
      description: "",
      targetDate: null,
      responsible: "Baraka Mtaji",
      status: "open",
    },
  ]),
  notes: vi
    .fn()
    .mockResolvedValue([
      {
        kind: "ended",
        author: "Baraka Mtaji",
        note: "The funding fell through",
        createdAt: new Date(),
      },
    ]),
  annotate: vi.fn().mockResolvedValue("ok"),
  ...over,
});

const click = async (name: string) => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })));
};

describe("PlansAdminScreen (A14)", () => {
  it("lists plans with names, the idea, status and progress", async () => {
    await act(async () => {
      render(<PlansAdminScreen api={fakeApi()} />);
    });
    expect(screen.getByText("Asha Mwita & Baraka Mtaji")).toBeTruthy();
    expect(screen.getByText("Solar dryers")).toBeTruthy();
    expect(screen.getByText("1 of 2 stages confirmed")).toBeTruthy();
  });

  it("shows the stages and notes, and adds an annotation", async () => {
    const api = fakeApi();
    await act(async () => {
      render(<PlansAdminScreen api={api} />);
    });
    await click("Show stages and notes");
    expect(screen.getByText(/Stage 2: First investment · Baraka Mtaji · Open/)).toBeTruthy();
    expect(screen.getByText(/Ended by Baraka Mtaji: The funding fell through/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Add an annotation"), {
      target: { value: "Both members called." },
    });
    await click("Save annotation");
    expect(api.annotate).toHaveBeenCalledWith("p1", "Both members called.");
    expect(api.notes).toHaveBeenCalledTimes(2);
  });
});
