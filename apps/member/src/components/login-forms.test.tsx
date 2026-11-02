import "../test-router";
import type { LoginClient } from "@kingdom-connect/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeForm, LoginForm } from "./login-forms";

const fakeClient = (overrides: Partial<LoginClient>): LoginClient => ({
  logIn: vi.fn(),
  verifyCode: vi.fn(),
  resendCode: vi.fn(),
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
