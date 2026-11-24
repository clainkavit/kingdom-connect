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

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const save = () =>
  act(async () => fireEvent.click(screen.getByRole("button", { name: "Set password" })));

describe("SetPassword (staff invite)", () => {
  it("asks for the password twice and saves nothing until the two match", async () => {
    const api = fakeApi();
    await show(api);
    type("New password", "staff-pass-1");
    type("Confirm new password", "staff-pass-2");
    await save();
    expect(api.setPassword).not.toHaveBeenCalled();
    const again = screen.getByLabelText("Confirm new password");
    expect(again.getAttribute("aria-invalid")).toBe("true");
    const problem = document.getElementById(again.getAttribute("aria-describedby") ?? "");
    expect(problem?.textContent).toBe("The two passwords are not the same.");

    type("New password", "staff-pass-2");
    expect(screen.queryByText("The two passwords are not the same.")).toBeNull();
    expect(again.getAttribute("aria-invalid")).not.toBe("true");
    await save();
    expect(api.setPassword).toHaveBeenCalledWith("staff-pass-2");
  });

  it("shows and hides each password with its own eye button", async () => {
    await show(fakeApi());
    const box = screen.getByLabelText("New password") as HTMLInputElement;
    const again = screen.getByLabelText("Confirm new password") as HTMLInputElement;
    expect(box.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password: New password" }));
    expect(box.type).toBe("text");
    expect(again.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Hide password: New password" }));
    expect(box.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password: Confirm new password" }));
    expect(again.type).toBe("text");
  });

  it("opens the invite link, then sets a password that meets the rule", async () => {
    const api = fakeApi();
    await show(api);
    expect(api.verify).toHaveBeenCalledWith("hash");
    type("New password", "short");
    type("Confirm new password", "short");
    await save();
    expect(api.setPassword).not.toHaveBeenCalled();

    type("New password", "staff-pass-1");
    type("Confirm new password", "staff-pass-1");
    await save();
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
