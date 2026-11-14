import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { AccessibilityInfo, Text } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnterOnChange, Reveal } from "./motion";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Menu({ open }: { open: boolean }) {
  return (
    <Reveal show={open} from="above" role="menu" aria-label="Language">
      <Text>English</Text>
    </Reveal>
  );
}

describe("Reveal", () => {
  it("shows nothing while closed and the content once opened", () => {
    const { rerender } = render(<Menu open={false} />);
    expect(screen.queryByText("English")).toBeNull();
    rerender(<Menu open />);
    expect(screen.getByRole("menu", { name: "Language" })).toBeTruthy();
  });

  it("on closing, hides the content from screen readers at once and removes it after the exit", async () => {
    const gone = vi.fn();
    const { rerender } = render(
      <Reveal show onGone={gone} role="menu" aria-label="Language">
        <Text>English</Text>
      </Reveal>,
    );
    rerender(
      <Reveal show={false} onGone={gone} role="menu" aria-label="Language">
        <Text>English</Text>
      </Reveal>,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(screen.queryByText("English")).toBeNull());
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it("skips the animation when the device asks for reduced motion", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const gone = vi.fn();
    const { rerender } = render(
      <Reveal show onGone={gone}>
        <Text>English</Text>
      </Reveal>,
    );
    await act(async () => undefined);
    rerender(
      <Reveal show={false} onGone={gone}>
        <Text>English</Text>
      </Reveal>,
    );
    expect(screen.queryByText("English")).toBeNull();
    expect(gone).toHaveBeenCalledTimes(1);
  });
});

describe("EnterOnChange", () => {
  it("keeps its children mounted when the value changes", () => {
    const { rerender } = render(
      <EnterOnChange value="/people">
        <Text testID="page">People</Text>
      </EnterOnChange>,
    );
    const before = screen.getByTestId("page");
    rerender(
      <EnterOnChange value="/opportunities">
        <Text testID="page">People</Text>
      </EnterOnChange>,
    );
    expect(screen.getByTestId("page")).toBe(before);
  });
});
