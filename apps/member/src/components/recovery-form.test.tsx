import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecoveryForm } from "./recovery-form";

afterEach(cleanup);

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("RecoveryForm (S04, R08c)", () => {
  it("sends the username, new email, last 4 digits and a new face photo", async () => {
    const send = vi.fn().mockResolvedValue("sent");
    const pickPhoto = vi.fn().mockResolvedValue({ base64: "aGk=", mime: "image/jpeg", size: 2 });
    render(<RecoveryForm send={send} pickPhoto={pickPhoto} />);
    type("Username", " lost_member ");
    type("New email", "new@test.invalid");
    type("Last 4 digits of your ID number", "12a34");
    await click("Take or choose a new photo of your face");
    await click("Send request");
    expect(send).toHaveBeenCalledWith({
      username: "lost_member",
      newEmail: "new@test.invalid",
      lastDigits: "1234",
      photo: "aGk=",
      mime: "image/jpeg",
    });
    expect(screen.getByText(/We received your request/)).toBeTruthy();
  });

  it("needs every field and the photo", async () => {
    const send = vi.fn();
    render(<RecoveryForm send={send} pickPhoto={vi.fn().mockResolvedValue(null)} />);
    type("Username", "lost_member");
    await click("Send request");
    expect(screen.getByRole("alert").textContent).toMatch(/Fill in every field/);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a photo over 5 MB", async () => {
    render(
      <RecoveryForm
        send={vi.fn()}
        pickPhoto={vi
          .fn()
          .mockResolvedValue({ base64: "x", mime: "image/png", size: 6 * 1024 * 1024 })}
      />,
    );
    await click("Take or choose a new photo of your face");
    expect(screen.getByRole("alert").textContent).toBe("The photo can be up to 5 MB.");
  });
});
