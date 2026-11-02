import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetPassword, type SetPasswordApi } from "./set-password";

afterEach(cleanup);

const fakeApi = (over: Partial<SetPasswordApi> = {}): SetPasswordApi => ({
  verify: vi.fn().mockResolvedValue(true),
  setPassword: vi.fn().mockResolvedValue(true),
  ...over,
});

async function show(api: SetPasswordApi, tokenHash: string | null = "hash") {
  await act(async () => {
    render(<SetPassword api={api} tokenHash={tokenHash} />);
  });
}

describe("SetPassword (staff invite)", () => {
  it("opens the invite link, then sets a password that meets the rule", async () => {
    const api = fakeApi();
    await show(api);
    expect(api.verify).toHaveBeenCalledWith("hash");
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Set password" })));
    expect(api.setPassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "staff-pass-1" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Set password" })));
    expect(api.setPassword).toHaveBeenCalledWith("staff-pass-1");
    expect(screen.getByText("Your password is set. Log in to continue.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to log in" }).getAttribute("href")).toBe("/login");
  });

  it("says when the link has expired or was used", async () => {
    await show(fakeApi({ verify: vi.fn().mockResolvedValue(false) }));
    expect(screen.getByText(/This link has expired or was already used/)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("says the same when there is no link at all", async () => {
    const api = fakeApi();
    await show(api, null);
    expect(api.verify).not.toHaveBeenCalled();
    expect(screen.getByText(/This link has expired or was already used/)).toBeTruthy();
  });
});
