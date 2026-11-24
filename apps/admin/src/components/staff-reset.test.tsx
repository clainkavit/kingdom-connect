import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffForgotForm, StaffForgotSent, StaffNewPassword } from "./staff-reset";

afterEach(cleanup);

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("Staff password reset (R30)", () => {
  it("asks for a reset with the email and then shows what happens next", async () => {
    const requestReset = vi.fn().mockResolvedValue(true);
    const onSent = vi.fn();
    await show(<StaffForgotForm requestReset={requestReset} onSent={onSent} />);
    expect(
      (screen.getByRole("button", { name: "Ask for a reset" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    type("Email", " asha@example.test ");
    await click("Ask for a reset");
    expect(requestReset).toHaveBeenCalledWith("asha@example.test");
    expect(onSent).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Back to log in" }).getAttribute("href")).toBe(
      "/login",
    );
  });

  it("says when the request could not be sent", async () => {
    const onSent = vi.fn();
    await show(<StaffForgotForm requestReset={vi.fn().mockResolvedValue(false)} onSent={onSent} />);
    type("Email", "asha@example.test");
    await click("Ask for a reset");
    expect(onSent).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("lists the three steps after the request", async () => {
    await show(<StaffForgotSent />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1A Super Administrator checks your request.",
      "2You get an email with a link. It works for 24 hours.",
      "3You choose a new password, then log in with your email and the code we send you.",
    ]);
  });

  it("shows whose account the link is for and saves two matching passwords", async () => {
    const save = vi.fn().mockResolvedValue("done");
    await show(
      <StaffNewPassword
        api={{ check: vi.fn().mockResolvedValue({ kind: "ok", email: "asha@example.test" }), save }}
      />,
    );
    expect(screen.getByText("asha@example.test")).toBeTruthy();

    type("New password", "short");
    type("Confirm new password", "short");
    await click("Save new password");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();

    type("New password", "longer-pass-1");
    type("Confirm new password", "longer-pass-2");
    await click("Save new password");
    expect(screen.getByRole("alert").textContent).toBe("The two passwords are not the same.");
    expect(screen.getByLabelText("Confirm new password").getAttribute("aria-invalid")).toBe("true");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Show password: New password" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Show password: Confirm new password" }),
    ).toBeTruthy();

    type("Confirm new password", "longer-pass-1");
    await click("Save new password");
    expect(save).toHaveBeenCalledWith("longer-pass-1");
    expect(screen.getByRole("status").textContent).toBe(
      "Your password is set. Log in to continue.",
    );
    expect(screen.getByRole("link", { name: "Go to log in" })).toBeTruthy();
  });

  it("says when the link has expired or was used", async () => {
    await show(
      <StaffNewPassword
        api={{ check: vi.fn().mockResolvedValue({ kind: "expired" }), save: vi.fn() }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/expired or was already used/);
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("moves to the expired state if the link runs out while the page is open", async () => {
    await show(
      <StaffNewPassword
        api={{
          check: vi.fn().mockResolvedValue({ kind: "ok", email: "asha@example.test" }),
          save: vi.fn().mockResolvedValue("expired"),
        }}
      />,
    );
    type("New password", "longer-pass-1");
    type("Confirm new password", "longer-pass-1");
    await click("Save new password");
    expect(screen.getByRole("alert").textContent).toMatch(/expired or was already used/);
  });
});
