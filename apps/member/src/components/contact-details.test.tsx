import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactApi } from "../lib/contact";
import { ContactDetails } from "./contact-details";

afterEach(cleanup);

const fakeApi = (over: Partial<ContactApi> = {}): ContactApi => ({
  setPhone: vi.fn().mockResolvedValue("ok"),
  setAddress: vi.fn().mockResolvedValue("ok"),
  startEmailChange: vi.fn().mockResolvedValue("ok"),
  confirmEmailChange: vi.fn().mockResolvedValue("ok"),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function show(api: ContactApi, onChanged = vi.fn()) {
  render(
    <ContactDetails
      api={api}
      phone="+255700000001"
      email="member@test.invalid"
      address=""
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

describe("ContactDetails (S45)", () => {
  it("changes the phone number", async () => {
    const api = fakeApi();
    const onChanged = show(api);
    await click("Change phone number");
    type("Phone number", "+255 754 000 999");
    await click("Save");
    expect(api.setPhone).toHaveBeenCalledWith("+255 754 000 999");
    expect(onChanged).toHaveBeenCalled();
  });

  it("says when the phone does not start with +255", async () => {
    show(fakeApi({ setPhone: vi.fn().mockResolvedValue("invalid_phone") }));
    await click("Change phone number");
    type("Phone number", "0754000999");
    await click("Save");
    expect(screen.getByRole("alert").textContent).toBe(
      "Enter a Tanzanian number starting with +255, for example +255 712 345 678.",
    );
  });

  it("changes the address", async () => {
    const api = fakeApi();
    show(api);
    await click("Change address");
    type("Address", "Ilemela, Mwanza");
    await click("Save");
    expect(api.setAddress).toHaveBeenCalledWith("Ilemela, Mwanza");
  });

  it("changes the email with the password and a code sent to the new address", async () => {
    const api = fakeApi();
    const onChanged = show(api);
    await click("Change email");
    type("Password", "secret-1");
    type("New email", "new@test.invalid");
    await click("Send a code to the new email");
    expect(api.startEmailChange).toHaveBeenCalledWith("secret-1", "new@test.invalid");
    expect(
      screen.getByText("We sent a code to new@test.invalid. It works for 10 minutes."),
    ).toBeTruthy();
    type("Code", "123456");
    await click("Confirm new email");
    expect(api.confirmEmailChange).toHaveBeenCalledWith("123456");
    expect(screen.getByText("Your email is changed. Use it to sign in from now on.")).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
  });

  it("refuses a wrong password or an email already in use", async () => {
    show(
      fakeApi({
        startEmailChange: vi
          .fn()
          .mockResolvedValueOnce("wrong_password")
          .mockResolvedValueOnce("email_taken"),
      }),
    );
    await click("Change email");
    type("Password", "x");
    type("New email", "taken@test.invalid");
    await click("Send a code to the new email");
    expect(screen.getByRole("alert").textContent).toBe("That password is not right.");
    await click("Send a code to the new email");
    expect(screen.getByRole("alert").textContent).toBe(
      "This email is already used by another account.",
    );
  });
});
