import "../test-router";
import type { LoginClient } from "@kingdom-connect/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { maskPhone, PhoneSignIn } from "./phone-sign-in";
import { WelcomeChoices } from "./welcome-choices";

afterEach(cleanup);

const fakeClient = (overrides: Partial<LoginClient>): LoginClient =>
  ({
    startPhoneSignIn: vi.fn().mockResolvedValue({ kind: "sent" }),
    verifyPhoneCode: vi.fn(),
    ...overrides,
  }) as unknown as LoginClient;

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

const type = (label: string, value: string) =>
  act(async () => fireEvent.change(screen.getByLabelText(label), { target: { value } }));
const press = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("PhoneSignIn (S04b)", () => {
  it("stops a number that is not Tanzanian before sending", async () => {
    const client = fakeClient({});
    await show(<PhoneSignIn client={client} onSignedIn={vi.fn()} onAnotherWay={vi.fn()} />);
    await type("Phone number", "+44 7700 900123");
    await press("Send me a code");
    expect(client.startPhoneSignIn).not.toHaveBeenCalled();
    expect(screen.getByText("Use a Tanzanian number that starts with +255.")).toBeTruthy();
  });

  it("sends the code, shows the number masked, and signs in with a right code", async () => {
    const session = { access_token: "a", refresh_token: "r" };
    const client = fakeClient({
      verifyPhoneCode: vi.fn().mockResolvedValue({ kind: "verified", session }),
    });
    const onSignedIn = vi.fn().mockResolvedValue(undefined);
    await show(<PhoneSignIn client={client} onSignedIn={onSignedIn} onAnotherWay={vi.fn()} />);
    await type("Phone number", "0712 345 412");
    await press("Send me a code");
    expect(client.startPhoneSignIn).toHaveBeenCalledWith("+255712345412");
    expect(screen.getByRole("heading", { name: "Enter the code" })).toBeTruthy();
    expect(screen.getByText(/\+255 7•• ••• 412/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Send a new code in/ })).toBeTruthy();
    await type("SMS code", "123456");
    await press("Continue");
    expect(client.verifyPhoneCode).toHaveBeenCalledWith("+255712345412", "123456");
    expect(onSignedIn).toHaveBeenCalledWith(session);
  });

  it("says how many tries are left after a wrong code, and Change the number goes back", async () => {
    const client = fakeClient({
      verifyPhoneCode: vi.fn().mockResolvedValue({ kind: "wrong_code", attemptsLeft: 2 }),
    });
    await show(<PhoneSignIn client={client} onSignedIn={vi.fn()} onAnotherWay={vi.fn()} />);
    await type("Phone number", "+255712345412");
    await press("Send me a code");
    await type("SMS code", "000000");
    await press("Continue");
    expect(screen.getByText(/2 tries left/)).toBeTruthy();
    await press("Change the number");
    expect(screen.getByRole("heading", { name: "Continue with your phone" })).toBeTruthy();
  });

  it("masks all but the last three digits", () => {
    expect(maskPhone("+255712345412")).toBe("+255 7•• ••• 412");
  });
});

describe("WelcomeChoices (S01)", () => {
  const base = {
    returnedWithError: false,
    onProvider: vi.fn().mockResolvedValue(true),
    onPhone: vi.fn(),
    onEmail: vi.fn(),
  };

  it("leaves out every way that is not switched on", async () => {
    await show(
      <WelcomeChoices
        {...base}
        providers={{ google: true, facebook: false, apple: false }}
        phone={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue with Facebook" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with Apple" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with phone number" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue with email" })).toBeTruthy();
  });

  it("offers phone and every provider that is on, and says when a provider fails", async () => {
    const onProvider = vi.fn().mockResolvedValue(false);
    const onPhone = vi.fn();
    await show(
      <WelcomeChoices
        {...base}
        onProvider={onProvider}
        onPhone={onPhone}
        providers={{ google: true, facebook: true, apple: true }}
        phone
      />,
    );
    await press("Continue with phone number");
    expect(onPhone).toHaveBeenCalled();
    await press("Continue with Facebook");
    expect(onProvider).toHaveBeenCalledWith("facebook");
    expect(screen.getByText("Sign-in did not finish. Try again or use another way.")).toBeTruthy();
  });
});
