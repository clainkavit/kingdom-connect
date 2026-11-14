import "../test-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Intro, INTRO_SEEN_KEY, useIntroState } from "./intro";

function Harness({ onLift, onDone }: { onLift: () => void; onDone: () => void }) {
  const [state, markSeen] = useIntroState();
  const [on, setOn] = useState(true);
  return on ? (
    <Intro
      state={state}
      onLift={onLift}
      onDone={() => {
        markSeen();
        setOn(false);
        onDone();
      }}
    />
  ) : (
    <p>landing</p>
  );
}

beforeEach(() => AsyncStorage.clear());
afterEach(cleanup);

describe("Intro (first open)", () => {
  it("plays on a device that has not seen it, and can be skipped", async () => {
    const onLift = vi.fn();
    const onDone = vi.fn();
    render(<Harness onLift={onLift} onDone={onDone} />);
    expect(screen.getByText("People")).toBeTruthy();
    expect(screen.getByText("Growth")).toBeTruthy();
    await act(async () => undefined); // the device storage answers: not seen yet, so it plays
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Skip" })));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onLift).toHaveBeenCalledTimes(1);
    expect(screen.getByText("landing")).toBeTruthy();
    expect(await AsyncStorage.getItem(INTRO_SEEN_KEY)).toBe("1");
  });

  it("does not play again on a device that has seen it", async () => {
    await AsyncStorage.setItem(INTRO_SEEN_KEY, "1");
    const onDone = vi.fn();
    render(<Harness onLift={vi.fn()} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: 1000 });
  });

  it("ends by itself in under 2.5 seconds", async () => {
    const onDone = vi.fn();
    render(<Harness onLift={vi.fn()} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: 2500 });
  });
});
