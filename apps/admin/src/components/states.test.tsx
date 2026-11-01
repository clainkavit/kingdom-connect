import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingRows, LockedState, SlowConnectionBanner } from "./states";

afterEach(cleanup);

describe("LoadingRows", () => {
  it("shows skeleton rows, not a spinner or a blank area", () => {
    render(<LoadingRows rows={4} />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(4);
  });
});

describe("EmptyState", () => {
  it("says what will appear and how to add the first item", () => {
    render(
      <EmptyState
        title="No reports yet"
        message="Reports from members appear here."
        action={{ label: "View guidelines", href: "/settings" }}
      />,
    );
    expect(screen.getByText("No reports yet")).toBeTruthy();
    expect(screen.getByText("Reports from members appear here.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View guidelines" }).getAttribute("href")).toBe(
      "/settings",
    );
  });
});

describe("ErrorState", () => {
  it("says what failed in plain words and offers Try again", () => {
    const retry = vi.fn();
    render(<ErrorState message="We couldn't load the reports." onRetry={retry} />);
    expect(screen.getByText("We couldn't load the reports.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("LockedState", () => {
  it("shows the screen name, one line of reason and the path forward", () => {
    render(
      <LockedState
        screenName="Platform settings"
        reason="Only a Super Administrator can change platform settings."
        action={{ label: "Ask a Super Administrator", href: "/settings" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Platform settings" })).toBeTruthy();
    expect(
      screen.getByText("Only a Super Administrator can change platform settings."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ask a Super Administrator" })).toBeTruthy();
  });
});

describe("SlowConnectionBanner", () => {
  it("shows a small banner while the connection is slow", () => {
    render(<SlowConnectionBanner slow />);
    expect(screen.getByRole("status").textContent).toContain("Slow connection");
  });

  it("shows nothing when the connection is fine", () => {
    const { container } = render(<SlowConnectionBanner slow={false} />);
    expect(container.textContent).toBe("");
  });
});
