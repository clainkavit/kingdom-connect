import "../test-router";
import type { LoginClient } from "@kingdom-connect/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeForm, ForgotPasswordForm, LoginForm } from "./login-forms";

const fakeClient = (overrides: Partial<LoginClient>): LoginClient => ({
  requestEmailRecovery: vi.fn(),
  logIn: vi.fn(),
  verifyCode: vi.fn(),
  resendCode: vi.fn(),
  startPasswordReset: vi.fn(),
  checkResetCode: vi.fn(),
  saveNewPassword: vi.fn(),
  ...overrides,
});

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LoginForm (S03)", () => {
  const submit = async () => {
    type("Username", "test_level1");
    type("Password", "secret");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Log in" })));
  };

  it("sends the username and password, then hands over the session", async () => {
    const session = { access_token: "a", refresh_token: "r" };
    const logIn = vi.fn().mockResolvedValue({ kind: "code_sent", session, resendAfterSeconds: 60 });
    const onCodeSent = vi.fn();
    render(<LoginForm client={fakeClient({ logIn })} onCodeSent={onCodeSent} />);
    await submit();
    expect(logIn).toHaveBeenCalledWith({ username: "test_level1", password: "secret" });
    expect(onCodeSent).toHaveBeenCalledWith(session, 60);
  });

  it("keeps Log in pressable and says what is missing", async () => {
    const logIn = vi.fn();
    render(<LoginForm client={fakeClient({ logIn })} onCodeSent={vi.fn()} />);
    type("Username", "test_level1");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Log in" })));
    expect(logIn).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your username and password.")).toBeTruthy();
  });

  it("gives one message for a wrong username or password", async () => {
    render(
      <LoginForm
        client={fakeClient({ logIn: vi.fn().mockResolvedValue({ kind: "invalid" }) })}
        onCodeSent={vi.fn()}
      />,
    );
    await submit();
    expect(screen.getByText("Wrong username or password.")).toBeTruthy();
  });

  it("counts down while the account is locked", async () => {
    render(
      <LoginForm
        client={fakeClient({
          logIn: vi.fn().mockResolvedValue({ kind: "locked", retryAfterSeconds: 900 }),
        })}
        onCodeSent={vi.fn()}
      />,
    );
    await submit();
    expect(screen.getByText("Too many failed attempts. Try again in 15:00.")).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(61_000));
    expect(screen.getByText("Too many failed attempts. Try again in 13:59.")).toBeTruthy();
  });

  it("tells a suspended Member why", async () => {
    render(
      <LoginForm
        client={fakeClient({ logIn: vi.fn().mockResolvedValue({ kind: "suspended" }) })}
        onCodeSent={vi.fn()}
      />,
    );
    await submit();
    expect(screen.getByText("Your account is suspended. An admin will review it.")).toBeTruthy();
  });

  it("says when the server cannot be reached, and keeps what was typed", async () => {
    render(
      <LoginForm
        client={fakeClient({ logIn: vi.fn().mockResolvedValue({ kind: "network" }) })}
        onCodeSent={vi.fn()}
      />,
    );
    await submit();
    expect(screen.getByText(/couldn't reach the server/)).toBeTruthy();
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("test_level1");
  });
});

describe("CodeForm (S04)", () => {
  const enter = async (code: string) => {
    type("Email code", code);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify" })));
  };

  it("verifies the code with the session's token", async () => {
    const verifyCode = vi.fn().mockResolvedValue({ kind: "verified" });
    const onVerified = vi.fn();
    render(
      <CodeForm
        client={fakeClient({ verifyCode })}
        accessToken="tok"
        resendAfterSeconds={60}
        onVerified={onVerified}
      />,
    );
    await enter("123456");
    expect(verifyCode).toHaveBeenCalledWith("tok", "123456");
    expect(onVerified).toHaveBeenCalled();
  });

  it("asks for all 6 numbers instead of sending a short code", async () => {
    const verifyCode = vi.fn();
    render(
      <CodeForm
        client={fakeClient({ verifyCode })}
        accessToken="tok"
        resendAfterSeconds={60}
        onVerified={vi.fn()}
      />,
    );
    await enter("123");
    expect(verifyCode).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the 6 numbers from the email.")).toBeTruthy();
  });

  it("shows each digit in its own box and drops anything that is not a digit", () => {
    render(
      <CodeForm
        client={fakeClient({})}
        accessToken="tok"
        resendAfterSeconds={60}
        onVerified={vi.fn()}
      />,
    );
    type("Email code", "4 8-1");
    expect(screen.getByTestId("code-boxes").textContent).toBe("481");
  });

  it("says how many tries are left after a wrong code", async () => {
    render(
      <CodeForm
        client={fakeClient({
          verifyCode: vi.fn().mockResolvedValue({ kind: "wrong_code", attemptsLeft: 2 }),
        })}
        accessToken="tok"
        resendAfterSeconds={60}
        onVerified={vi.fn()}
      />,
    );
    await enter("000000");
    expect(screen.getByText("That code is not right. 2 tries left.")).toBeTruthy();
  });

  it("asks for a new code after 3 wrong tries or when the code expired", async () => {
    const verifyCode = vi
      .fn()
      .mockResolvedValueOnce({ kind: "too_many" })
      .mockResolvedValueOnce({ kind: "expired" });
    render(
      <CodeForm
        client={fakeClient({ verifyCode })}
        accessToken="tok"
        resendAfterSeconds={60}
        onVerified={vi.fn()}
      />,
    );
    await enter("000000");
    expect(screen.getByText("Too many wrong codes. Send a new code.")).toBeTruthy();
    await enter("000000");
    expect(screen.getByText("This code has expired. Send a new code.")).toBeTruthy();
  });

  it("allows a new code only after 60 seconds", async () => {
    const resendCode = vi.fn().mockResolvedValue({ kind: "sent", resendAfterSeconds: 60 });
    render(
      <CodeForm
        client={fakeClient({ resendCode })}
        accessToken="tok"
        resendAfterSeconds={60}
        onVerified={vi.fn()}
      />,
    );
    expect(screen.getByText("Send a new code in 60s")).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(60_000));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send a new code" })));
    expect(resendCode).toHaveBeenCalledWith("tok");
    expect(screen.getByText("Send a new code in 60s")).toBeTruthy();
  });
});

describe("ForgotPasswordForm (S04a)", () => {
  const press = async (name: string) =>
    act(async () => fireEvent.click(screen.getByRole("button", { name })));
  const started = vi
    .fn()
    .mockResolvedValue({ kind: "sent", resetId: "r-1", resendAfterSeconds: 60 });

  it("sends the username, then gives the same answer whether or not it exists", async () => {
    const startPasswordReset = started;
    render(<ForgotPasswordForm client={fakeClient({ startPasswordReset })} onLogIn={vi.fn()} />);
    type("Username", " neema ");
    await press("Send code");
    expect(startPasswordReset).toHaveBeenCalledWith("neema");
    expect(
      screen.getByText(
        "If the username is right, we sent a 6-digit code to its email. It works for 10 minutes.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send a new code in 60s" })).toBeTruthy();
    expect(screen.getByText("No access to that email?")).toBeTruthy();
  });

  it("asks for the username before sending a code", async () => {
    const startPasswordReset = vi.fn();
    render(<ForgotPasswordForm client={fakeClient({ startPasswordReset })} onLogIn={vi.fn()} />);
    await press("Send code");
    expect(startPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your username.")).toBeTruthy();
  });

  it("checks the code, then saves the new password typed twice", async () => {
    const checkResetCode = vi.fn().mockResolvedValue({ kind: "verified" });
    const saveNewPassword = vi.fn().mockResolvedValue({ kind: "verified" });
    const onLogIn = vi.fn();
    render(
      <ForgotPasswordForm
        client={fakeClient({ startPasswordReset: started, checkResetCode, saveNewPassword })}
        onLogIn={onLogIn}
      />,
    );
    type("Username", "neema");
    await press("Send code");
    type("Email code", "123456");
    await press("Verify");
    expect(checkResetCode).toHaveBeenCalledWith("r-1", "123456");

    type("New password", "newpass12");
    type("Type the new password again", "newpass13");
    await press("Save password");
    expect(screen.getByText("The two passwords are not the same.")).toBeTruthy();
    expect(saveNewPassword).not.toHaveBeenCalled();

    type("Type the new password again", "newpass12");
    await press("Save password");
    expect(saveNewPassword).toHaveBeenCalledWith("r-1", "123456", "newpass12");
    expect(
      screen.getByText(/Your password was changed\. You are signed out on every other device/),
    ).toBeTruthy();
    await press("Log in");
    expect(onLogIn).toHaveBeenCalled();
  });

  it("refuses a weak password before sending it", async () => {
    const saveNewPassword = vi.fn();
    render(
      <ForgotPasswordForm
        client={fakeClient({
          startPasswordReset: started,
          checkResetCode: vi.fn().mockResolvedValue({ kind: "verified" }),
          saveNewPassword,
        })}
        onLogIn={vi.fn()}
      />,
    );
    type("Username", "neema");
    await press("Send code");
    type("Email code", "123456");
    await press("Verify");
    type("New password", "short");
    type("Type the new password again", "short");
    await press("Save password");
    expect(screen.getByText("Use at least 8 characters, with a number.")).toBeTruthy();
    expect(saveNewPassword).not.toHaveBeenCalled();
  });

  it("says how many tries are left after a wrong code", async () => {
    render(
      <ForgotPasswordForm
        client={fakeClient({
          startPasswordReset: started,
          checkResetCode: vi.fn().mockResolvedValue({ kind: "wrong_code", attemptsLeft: 2 }),
        })}
        onLogIn={vi.fn()}
      />,
    );
    type("Username", "neema");
    await press("Send code");
    type("Email code", "111111");
    await press("Verify");
    expect(screen.getByText("That code is not right. 2 tries left.")).toBeTruthy();
  });

  it("goes back to the code step when the code ran out while typing the password", async () => {
    render(
      <ForgotPasswordForm
        client={fakeClient({
          startPasswordReset: started,
          checkResetCode: vi.fn().mockResolvedValue({ kind: "verified" }),
          saveNewPassword: vi.fn().mockResolvedValue({ kind: "expired" }),
        })}
        onLogIn={vi.fn()}
      />,
    );
    type("Username", "neema");
    await press("Send code");
    type("Email code", "123456");
    await press("Verify");
    type("New password", "newpass12");
    type("Type the new password again", "newpass12");
    await press("Save password");
    expect(screen.getByText("This code has expired. Send a new code.")).toBeTruthy();
    expect(screen.getByLabelText("Email code")).toBeTruthy();
  });

  it("says when the server cannot be reached", async () => {
    render(
      <ForgotPasswordForm
        client={fakeClient({ startPasswordReset: vi.fn().mockResolvedValue({ kind: "network" }) })}
        onLogIn={vi.fn()}
      />,
    );
    type("Username", "neema");
    await press("Send code");
    expect(screen.getByText(/couldn't reach the server/)).toBeTruthy();
  });
});
