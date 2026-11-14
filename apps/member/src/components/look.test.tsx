import { router } from "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./form";
import { LookGate, LookHome, LookProvider, useAct, type LookAction } from "./look";

afterEach(() => {
  cleanup();
  router.pathname = "/";
  router.pushed.length = 0;
});

function ApplyButton({ run, action = "apply" }: { run: () => void; action?: LookAction }) {
  const act = useAct();
  return <Button label="Apply" onPress={() => act(action, run)} />;
}

const widgets = { latest: vi.fn().mockResolvedValue([]), featured: vi.fn().mockResolvedValue([]) };

describe("look, but not act (R27)", () => {
  it("runs the action for a verified member, with no prompt", () => {
    const run = vi.fn();
    render(
      <LookProvider looking={false}>
        <ApplyButton run={run} />
      </LookProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(run).toHaveBeenCalled();
    expect(screen.queryByText("Verify your identity to apply")).toBeNull();
  });

  it("asks someone who is not verified to verify instead, and runs nothing", async () => {
    const run = vi.fn();
    render(
      <LookProvider looking>
        <ApplyButton run={run} />
      </LookProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply" })));
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText("Verify your identity to apply")).toBeTruthy();
    expect(screen.getByText(/only hear from verified members/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue verification" }));
    expect(router.pushed).toEqual(["/registration"]);
  });

  it("names the action it waits for", async () => {
    render(
      <LookProvider looking>
        <ApplyButton run={vi.fn()} action="save" />
      </LookProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply" })));
    expect(screen.getByText("Verify your identity to save posts")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(router.pushed).toEqual([]);
  });

  it("shows read-only pages and locks the rest", () => {
    router.pathname = "/opportunities/6f1c2a90-1b2c-4d3e-8f90-a1b2c3d4e5f6";
    const { rerender } = render(
      <LookProvider looking>
        <LookGate>
          <span>Opportunity page</span>
        </LookGate>
      </LookProvider>,
    );
    expect(screen.getByText("Opportunity page")).toBeTruthy();
    router.pathname = "/people";
    rerender(
      <LookProvider looking>
        <LookGate>
          <span>People page</span>
        </LookGate>
      </LookProvider>,
    );
    expect(screen.queryByText("People page")).toBeNull();
    expect(screen.getByText("This opens once you are verified")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue verification" }).getAttribute("href")).toBe(
      "/registration",
    );
  });

  it("never locks anything for a verified member", () => {
    router.pathname = "/people";
    render(
      <LookProvider looking={false}>
        <LookGate>
          <span>People page</span>
        </LookGate>
      </LookProvider>,
    );
    expect(screen.getByText("People page")).toBeTruthy();
  });

  it("Home says the member is not verified yet, shows what is open and locks People (S08)", async () => {
    await act(async () => {
      render(<LookHome widgets={widgets} status={async () => ({ kind: "drafting" })} />);
    });
    expect(screen.getByText("Not verified yet")).toBeTruthy();
    expect(screen.getByText("Verify your identity to connect, apply and post")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue verification" }).getAttribute("href")).toBe(
      "/registration",
    );
    expect(screen.getByText("People open after verification")).toBeTruthy();
    expect(widgets.latest).toHaveBeenCalled();
  });

  it("tells an applicant who sent the steps that their identity is being checked (S08)", async () => {
    await act(async () => {
      render(<LookHome widgets={widgets} status={async () => ({ kind: "under_review" })} />);
    });
    expect(screen.getByText("Your identity is being checked")).toBeTruthy();
    expect(screen.queryByText("Verify your identity to connect, apply and post")).toBeNull();
    expect(screen.getByRole("link", { name: "See your application" }).getAttribute("href")).toBe(
      "/registration",
    );
  });
});
