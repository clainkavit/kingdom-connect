import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, Field } from "./form";

afterEach(cleanup);

const button = () => screen.getByRole("button", { name: "Send" });

describe("Button", () => {
  it("shows it is busy and ignores taps while its action runs, then is ready again", async () => {
    let finish: () => void = () => undefined;
    const onPress = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<Button label="Send" onPress={onPress} />);

    await act(async () => fireEvent.click(button()));
    expect(button().getAttribute("aria-busy")).toBe("true");
    await act(async () => fireEvent.click(button()));
    expect(onPress).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(button().getAttribute("aria-busy")).not.toBe("true");
    await act(async () => fireEvent.click(button()));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("is ready again after its action fails", async () => {
    const onPress = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    render(<Button label="Send" onPress={onPress} />);
    await act(async () => fireEvent.click(button()));
    expect(button().getAttribute("aria-busy")).not.toBe("true");
    await act(async () => fireEvent.click(button()));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("stays a plain button for an action that is not async", async () => {
    const onPress = vi.fn();
    render(<Button label="Send" onPress={onPress} />);
    await act(async () => fireEvent.click(button()));
    await act(async () => fireEvent.click(button()));
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(button().getAttribute("aria-busy")).not.toBe("true");
  });
});

describe("Field for a password", () => {
  const box = () => screen.getByLabelText("Password") as HTMLInputElement;
  const eye = (name: string) => screen.getByRole("button", { name });

  it("hides what is typed until the eye is pressed, and hides it again on a second press", async () => {
    render(<Field label="Password" value="secret123" onChange={vi.fn()} secure />);
    expect(box().type).toBe("password");
    await act(async () => fireEvent.click(eye("Show password: Password")));
    expect(box().type).not.toBe("password");
    expect(box().value).toBe("secret123");
    await act(async () => fireEvent.click(eye("Hide password: Password")));
    expect(box().type).toBe("password");
  });

  it("has no eye on a box that is not a password", () => {
    render(<Field label="Username" value="" onChange={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
