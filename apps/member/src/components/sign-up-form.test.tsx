import "../test-router";
import type { LoginClient, RegistrationClient } from "@kingdom-connect/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignUpForm } from "./sign-up-form";

afterEach(cleanup);

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const clients = (signUp: RegistrationClient["signUp"]) => ({
  registration: {
    signUp,
    saveIdentity: vi.fn(),
    submit: vi.fn(),
    status: vi.fn(),
    startResubmission: vi.fn(),
  } as RegistrationClient,
  login: {
    requestEmailRecovery: vi.fn(),
    logIn: vi.fn().mockResolvedValue({
      kind: "code_sent",
      session: { access_token: "a", refresh_token: "r" },
      resendAfterSeconds: 60,
    }),
    verifyCode: vi.fn(),
    resendCode: vi.fn(),
    startPasswordReset: vi.fn(),
    checkResetCode: vi.fn(),
    saveNewPassword: vi.fn(),
    startPhoneSignIn: vi.fn(),
    verifyPhoneCode: vi.fn(),
  } as LoginClient,
});

const fillAll = () => {
  fill("Username", "test_user");
  fill("Email", "test.user@example.test");
  fill("Phone", "0712 345 678");
  fill("Password", "secret123");
  fill("Type the password again", "secret123");
};

const create = () =>
  act(async () => fireEvent.click(screen.getByRole("button", { name: "Create an account" })));

describe("SignUpForm (S02)", () => {
  it("says under the email and phone that members see them only through a connection", () => {
    render(<SignUpForm {...clients(vi.fn())} onCodeSent={vi.fn()} />);
    expect(
      screen.getAllByText("Other members see this only if you connect and choose to share it."),
    ).toHaveLength(2);
  });

  it("checks the form before sending anything", async () => {
    const signUp = vi.fn();
    render(<SignUpForm {...clients(signUp)} onCodeSent={vi.fn()} />);
    fill("Phone", "+254712345678");
    await create();
    expect(signUp).not.toHaveBeenCalled();
    expect(
      screen.getByText("Enter a Tanzanian number, for example +255 712 345 678."),
    ).toBeTruthy();
    expect(screen.getAllByText("This is needed.")).toHaveLength(4);
  });

  it("asks for the password twice and sends nothing until the two match", async () => {
    const signUp = vi.fn().mockResolvedValue({ kind: "created" });
    render(<SignUpForm {...clients(signUp)} onCodeSent={vi.fn()} />);
    fillAll();
    fill("Type the password again", "secret124");
    await create();
    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByText("The two passwords are not the same.")).toBeTruthy();
    expect(screen.getByLabelText("Type the password again").getAttribute("aria-invalid")).toBe(
      "true",
    );

    fill("Password", "secret124");
    expect(screen.queryByText("The two passwords are not the same.")).toBeNull();
    await create();
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ password: "secret124" }));
  });

  it("lets both password boxes be shown", () => {
    render(<SignUpForm {...clients(vi.fn())} onCodeSent={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Show password: Password" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Show password: Type the password again" }),
    ).toBeTruthy();
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

  it("asks people over the daily cap to come back tomorrow (PRD section 6, criterion 15)", async () => {
    render(
      <SignUpForm
        {...clients(vi.fn().mockResolvedValue({ kind: "cap_reached" }))}
        onCodeSent={vi.fn()}
      />,
    );
    fillAll();
    await create();
    expect(screen.getByRole("alert").textContent).toBe(
      "We're reviewing a high number of applications, please try again tomorrow.",
    );
  });
});
