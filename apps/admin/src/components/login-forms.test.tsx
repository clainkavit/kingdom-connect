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

describe("LoginForm (admin)", () => {
  const submit = async () => {
    type("Email", "test.admin@example.test");
    type("Password", "secret");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Log in" })));
  };

  it("signs Administrators in with their email", async () => {
    const session = { access_token: "a", refresh_token: "r" };
    const logIn = vi.fn().mockResolvedValue({ kind: "code_sent", session, resendAfterSeconds: 60 });
    const onCodeSent = vi.fn();
    render(<LoginForm client={fakeClient({ logIn })} onCodeSent={onCodeSent} />);
    await submit();
    expect(logIn).toHaveBeenCalledWith({ email: "test.admin@example.test", password: "secret" });
    expect(onCodeSent).toHaveBeenCalledWith(session, 60);
  });

  it("gives one message for a wrong email or password", async () => {
    render(
      <LoginForm
        client={fakeClient({ logIn: vi.fn().mockResolvedValue({ kind: "invalid" }) })}
        onCodeSent={vi.fn()}
      />,
    );
    await submit();
    expect(screen.getByRole("alert").textContent).toBe("Wrong email or password.");
  });

  it("counts down while the account is locked", async () => {
    render(
      <LoginForm
        client={fakeClient({
          logIn: vi.fn().mockResolvedValue({ kind: "locked", retryAfterSeconds: 61 }),
        })}
        onCodeSent={vi.fn()}
      />,
    );
    await submit();
    expect(screen.getByRole("alert").textContent).toBe(
      "Too many failed attempts. Try again in 1:01.",
    );
    expect((screen.getByRole("button", { name: "Log in" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe("CodeForm (admin)", () => {
  it("says how many tries are left after a wrong code", async () => {
    render(
      <CodeForm
        client={fakeClient({
          verifyCode: vi.fn().mockResolvedValue({ kind: "wrong_code", attemptsLeft: 1 }),
        })}
        accessToken="tok"
        resendAfterSeconds={60}
        onVerified={vi.fn()}
      />,
    );
    type("Email code", "000000");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify" })));
    expect(screen.getByRole("alert").textContent).toBe("That code is not right. 1 try left.");
  });

  it("verifies and allows a new code only after 60 seconds", async () => {
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
    expect(screen.getByRole("button", { name: "Send a new code in 60s" })).toBeTruthy();
    type("Email code", "123456");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify" })));
    expect(verifyCode).toHaveBeenCalledWith("tok", "123456");
    expect(onVerified).toHaveBeenCalled();
  });
});
