import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Recovery, RecoveriesApi } from "@/lib/recoveries";
import { RecoveriesScreen } from "./recoveries";

afterEach(cleanup);

const recovery = (over: Partial<Recovery> = {}): Recovery => ({
  id: "q1",
  username: "lost_member",
  fullName: "Lost Member",
  newEmail: "new@test.invalid",
  digitsMatch: true,
  filedByStaff: false,
  filedByMe: false,
  requestedAt: new Date("2026-11-04T09:00:00+03:00"),
  facePhotoUrl: "https://files.test/face",
  idPhotoUrl: "https://files.test/id",
  newPhotoUrl: "https://files.test/new",
  ...over,
});

const fakeApi = (over: Partial<RecoveriesApi> = {}): RecoveriesApi => ({
  pending: vi.fn().mockResolvedValue([recovery()]),
  decide: vi.fn().mockResolvedValue("ok"),
  file: vi.fn().mockResolvedValue("sent"),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

async function show(api: RecoveriesApi) {
  await act(async () => {
    render(<RecoveriesScreen api={api} />);
  });
}

describe("RecoveriesScreen (R08c)", () => {
  it("shows the three photos and the digit check, and approves", async () => {
    const api = fakeApi();
    await show(api);
    expect(screen.getByRole("img", { name: "Face photo on file" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "ID photo on file" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "New face photo" })).toBeTruthy();
    expect(screen.getByText("Last 4 ID digits match")).toBeTruthy();
    await click("Approve the new email");
    expect(api.decide).toHaveBeenCalledWith("q1", true, "");
    expect(screen.getByText("Decision saved. Both emails are told.")).toBeTruthy();
  });

  it("refuses with a reason", async () => {
    const api = fakeApi();
    await show(api);
    await click("Refuse");
    fireEvent.change(screen.getByLabelText("Reason, sent to the new email (required)"), {
      target: { value: "The photo does not match" },
    });
    await click("Refuse");
    expect(api.decide).toHaveBeenCalledWith("q1", false, "The photo does not match");
  });

  it("does not let the Administrator who filed a request decide it", async () => {
    await show(fakeApi({ pending: vi.fn().mockResolvedValue([recovery({ filedByMe: true })]) }));
    expect(screen.queryByRole("button", { name: "Approve the new email" })).toBeNull();
    expect(screen.getByText(/Another Administrator must decide it/)).toBeTruthy();
  });

  it("says when nothing is waiting", async () => {
    await show(fakeApi({ pending: vi.fn().mockResolvedValue([]) }));
    expect(screen.getByText("No requests waiting")).toBeTruthy();
  });
});
