import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvestorApplication, Investor, InvestorsApi } from "@/lib/investors";
import { InvestorsScreen } from "./investors";

afterEach(cleanup);

const application: InvestorApplication = {
  id: "a1",
  memberId: "m2",
  name: "Baraka Biashara",
  username: "baraka",
  sectorEn: "Agriculture",
  sectorSw: "Kilimo",
  band: "10m_to_50m",
  note: "We back farm businesses.",
  appliedAt: new Date("2026-11-06T09:00:00+03:00"),
};
const investor: Investor = {
  memberId: "m3",
  name: "Imani Invited",
  username: "imani",
  route: "invitation",
  sectorEn: null,
  sectorSw: null,
  band: null,
  grantedAt: new Date("2026-11-05T09:00:00+03:00"),
  grantedBy: "Investor Desk",
};

const fakeApi = (over: Partial<InvestorsApi> = {}): InvestorsApi => ({
  investors: vi.fn().mockResolvedValue([investor]),
  applications: vi.fn().mockResolvedValue([application]),
  search: vi.fn().mockResolvedValue([]),
  invite: vi.fn().mockResolvedValue("ok"),
  decide: vi.fn().mockResolvedValue("ok"),
  revoke: vi.fn().mockResolvedValue("ok"),
  ...over,
});

const click = async (name: string) => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })));
};

async function show(api: InvestorsApi) {
  await act(async () => {
    render(<InvestorsScreen api={api} />);
  });
}

describe("InvestorsScreen (A10)", () => {
  it("shows applications and investors, and approves an application", async () => {
    const api = fakeApi();
    await show(api);
    expect(screen.getByText("Baraka Biashara · @baraka")).toBeTruthy();
    expect(screen.getByText("We back farm businesses.")).toBeTruthy();
    expect(screen.getByText("Imani Invited · @imani")).toBeTruthy();
    await click("Grant investor tools");
    expect(api.decide).toHaveBeenCalledWith("a1", true);
    expect(api.investors).toHaveBeenCalledTimes(2);
  });

  it("invites a member found by name, with a band", async () => {
    const search = vi.fn().mockResolvedValue([
      { memberId: "m4", name: "Neema Joseph", username: "neema", isInvestor: false },
      { memberId: "m3", name: "Imani Invited", username: "imani", isInvestor: true },
    ]);
    const api = fakeApi({ search });
    await show(api);
    fireEvent.change(screen.getByLabelText("Name or username"), { target: { value: "ne" } });
    await click("Over TZS 50M");
    await click("Find");
    expect(search).toHaveBeenCalledWith("ne");
    expect(screen.getByText("Already has investor tools")).toBeTruthy();
    await click("Invite");
    expect(api.invite).toHaveBeenCalledWith("m4", "over_50m");
    expect(screen.getByText("Neema Joseph · @neema now has investor tools.")).toBeTruthy();
  });

  it("revokes after a confirm", async () => {
    const api = fakeApi();
    await show(api);
    await click("Revoke");
    expect(api.revoke).not.toHaveBeenCalled();
    await click("Revoke");
    expect(api.revoke).toHaveBeenCalledWith("m3");
  });
});
