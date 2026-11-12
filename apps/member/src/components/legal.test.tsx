import "../test-router";
import { stringsFor } from "@kingdom-connect/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageContext } from "../lib/language";
import type { PendingText } from "../lib/legal";
import { AcceptTexts } from "./legal";

afterEach(cleanup);

const text = (over: Partial<PendingText>): PendingText => ({
  id: "t1",
  kind: "terms",
  version: "0.2",
  body_en: "# Terms of use\n\n{entity_name} runs {platform_name}.\n\n- Be kind.",
  body_sw: "# Masharti ya matumizi\n\n{entity_name} inaendesha {platform_name}.\n\n- Kuwa mwema.",
  approved_at: null,
  ...over,
});

const texts = [text({}), text({ id: "t2", kind: "privacy", version: "0.1" })];

function inLanguage(language: "en" | "sw", ui: React.ReactNode) {
  return render(
    <LanguageContext.Provider
      value={{
        language,
        t: stringsFor(language),
        platformName: "Test Platform",
        setLanguage: vi.fn(),
      }}
    >
      {ui}
    </LanguageContext.Provider>,
  );
}

describe("AcceptTexts (S07)", () => {
  it("shows each changed text with its version, draft label and the entity name filled in", () => {
    inLanguage("en", <AcceptTexts texts={texts} entityName="Test Entity Ltd" onAccept={vi.fn()} />);
    expect(screen.getByText("Version 0.2")).toBeTruthy();
    expect(screen.getAllByText("Draft. Not yet approved by a lawyer.")).toHaveLength(2);
    expect(screen.getAllByText("Test Entity Ltd runs Test Platform.")).toHaveLength(2);
    expect(screen.getAllByText("Be kind.")).toHaveLength(2);
  });

  it("says to tick every text when Continue is pressed early, then accepts them all", async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    inLanguage("en", <AcceptTexts texts={texts} entityName="E" onAccept={onAccept} />);
    const next = screen.getByRole("button", { name: "Continue" });
    fireEvent.click(screen.getByRole("checkbox", { name: "I accept the terms of use" }));
    await act(async () => fireEvent.click(next));
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByText("Tick each box to accept.")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "I accept the privacy notice" }));
    expect(screen.queryByText("Tick each box to accept.")).toBeNull();
    await act(async () => fireEvent.click(next));
    expect(onAccept).toHaveBeenCalledWith(["t1", "t2"]);
  });

  it("shows the Kiswahili text in Kiswahili", () => {
    inLanguage("sw", <AcceptTexts texts={[text({})]} entityName="E" onAccept={vi.fn()} />);
    expect(screen.getByText("E inaendesha Test Platform.")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Nakubali masharti ya matumizi" })).toBeTruthy();
  });

  it("says when accepting fails, and keeps the screen", async () => {
    const onAccept = vi.fn().mockRejectedValue(new Error("offline"));
    inLanguage("en", <AcceptTexts texts={[text({})]} entityName="E" onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
    expect(screen.getByRole("alert").textContent).toContain("couldn't reach the server");
  });
});
