import "../test-router";
import type { LoginClient, RegistrationClient } from "@kingdom-connect/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignUpForm } from "./sign-up-form";

afterEach(cleanup);

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const clients = (signUp: RegistrationClient["signUp"]) => ({
  registration: { signUp, saveIdentity: vi.fn(), submit: vi.fn() } as RegistrationClient,
  login: {
    logIn: vi.fn().mockResolvedValue({
      kind: "code_sent",
      session: { access_token: "a", refresh_token: "r" },
      resendAfterSeconds: 60,
    }),
    verifyCode: vi.fn(),
    resendCode: vi.fn(),
  } as LoginClient,
});

const fillAll = () => {
  fill("Username", "test_user");
  fill("Email", "test.user@example.test");
  fill("Phone", "0712 345 678");
  fill("Password", "secret123");
};

const create = () =>
  act(async () => fireEvent.click(screen.getByRole("button", { name: "Create an account" })));

describe("SignUpForm (S02)", () => {
  it("checks the form before sending anything", async () => {
    const signUp = vi.fn();
    render(<SignUpForm {...clients(signUp)} onCodeSent={vi.fn()} />);
    fill("Phone", "+254712345678");
    await create();
    expect(signUp).not.toHaveBeenCalled();
    expect(
      screen.getByText("Enter a Tanzanian number, for example +255 712 345 678."),
    ).toBeTruthy();
    expect(screen.getAllByText("This is needed.")).toHaveLength(3);
  });

  it("creates the account, then signs straight in to the email code", async () => {
    const signUp = vi.fn().mockResolvedValue({ kind: "created" });
    const c = clients(signUp);
    const onCodeSent = vi.fn();
    render(<SignUpForm {...c} onCodeSent={onCodeSent} />);
    fillAll();
    await create();
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ username: "test_user", language: "en" }),
    );
    expect(c.login.logIn).toHaveBeenCalledWith({ username: "test_user", password: "secret123" });
    expect(onCodeSent).toHaveBeenCalled();
  });

  it("says when the username is taken", async () => {
    render(
      <SignUpForm
        {...clients(vi.fn().mockResolvedValue({ kind: "username_taken" }))}
        onCodeSent={vi.fn()}
      />,
    );
    fillAll();
    await create();
    expect(screen.getByRole("alert").textContent).toBe("That username is taken. Choose another.");
  });

  it("says when registration is not open yet", async () => {
    render(
      <SignUpForm
        {...clients(vi.fn().mockResolvedValue({ kind: "closed" }))}
        onCodeSent={vi.fn()}
      />,
    );
    fillAll();
    await create();
    expect(screen.getByRole("alert").textContent).toBe("Registration opens soon.");
  });
});
