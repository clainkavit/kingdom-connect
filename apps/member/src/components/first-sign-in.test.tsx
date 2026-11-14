import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSignIn, GoogleButton, type FirstSignInApi } from "./first-sign-in";

afterEach(cleanup);

const texts = [
  {
    id: "t1",
    kind: "terms" as const,
    version: "0.2",
    body_en: "Terms text",
    body_sw: "Masharti",
    approved_at: null,
  },
  {
    id: "p1",
    kind: "privacy" as const,
    version: "0.3",
    body_en: "Privacy text",
    body_sw: "Faragha",
    approved_at: null,
  },
];

function fakeApi(over: Partial<FirstSignInApi> = {}): FirstSignInApi {
  return {
    suggest: vi.fn().mockResolvedValue("neema.joseph"),
    email: vi.fn().mockResolvedValue("neema.joseph@example.test"),
    texts: vi.fn().mockResolvedValue(texts),
    complete: vi.fn().mockResolvedValue("ok"),
    done: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

async function show(api: FirstSignInApi) {
  await act(async () => {
    render(<FirstSignIn api={api} entityName="Kingdom Connect" />);
  });
}

async function acceptBoth() {
  await act(async () =>
    fireEvent.click(screen.getByRole("checkbox", { name: "I accept the terms of use" })),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("checkbox", { name: "I accept the privacy notice" })),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Agree and continue" })),
  );
}

describe("First sign-in (S01a, R26)", () => {
  it("says how they signed in and offers a free username", async () => {
    await show(fakeApi());
    expect(screen.getByText(/neema\.joseph@example\.test/)).toBeTruthy();
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("neema.joseph");
  });

  it("makes the account with the username and both texts, then moves on", async () => {
    const api = fakeApi();
    await show(api);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "neema.j" } });
    await acceptBoth();
    expect(api.complete).toHaveBeenCalledWith("neema.j", ["t1", "p1"]);
    expect(api.done).toHaveBeenCalled();
  });

  it("says when the username is taken, and stays", async () => {
    const api = fakeApi({ complete: vi.fn().mockResolvedValue("username_taken") });
    await show(api);
    await acceptBoth();
    expect(screen.getByText("That username is taken. Choose another.")).toBeTruthy();
    expect(api.done).not.toHaveBeenCalled();
  });

  it("needs both texts ticked: one tick sends nothing", async () => {
    const api = fakeApi();
    await show(api);
    await act(async () =>
      fireEvent.click(screen.getByRole("checkbox", { name: "I accept the terms of use" })),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Agree and continue" })),
    );
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("says when the email already has an account, so no second one is made", async () => {
    const api = fakeApi({ complete: vi.fn().mockResolvedValue("email_taken") });
    await show(api);
    await acceptBoth();
    expect(screen.getByText("That email is already registered. Log in instead.")).toBeTruthy();
    expect(api.done).not.toHaveBeenCalled();
  });

  it("checks the username before sending", async () => {
    const api = fakeApi();
    await show(api);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "x" } });
    await acceptBoth();
    expect(api.complete).not.toHaveBeenCalled();
  });
});

describe("Continue with Google (S01)", () => {
  it("is absent until Google sign-in is switched on", () => {
    render(<GoogleButton enabled={false} onPress={vi.fn().mockResolvedValue(true)} />);
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });

  it("starts the Google sign-in when switched on", async () => {
    const onPress = vi.fn().mockResolvedValue(true);
    render(<GoogleButton enabled onPress={onPress} />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" })),
    );
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByText(/Sign-in did not finish/)).toBeNull();
  });

  it("says when Google sign-in did not finish", async () => {
    render(<GoogleButton enabled onPress={vi.fn().mockResolvedValue(false)} />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" })),
    );
    expect(screen.getByText("Sign-in did not finish. Try again or use another way.")).toBeTruthy();
  });

  it("says so when Google sent the person back with an error", () => {
    render(<GoogleButton enabled returnedWithError onPress={vi.fn().mockResolvedValue(true)} />);
    expect(screen.getByText("Sign-in did not finish. Try again or use another way.")).toBeTruthy();
  });
});
