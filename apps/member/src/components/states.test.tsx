import "../test-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingRows, LockedState, SlowConnectionBanner } from "./states";

afterEach(cleanup);

describe("LoadingRows", () => {
  it("shows skeleton rows, not a spinner or a blank area", () => {
    render(<LoadingRows rows={3} />);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
  });
});

describe("EmptyState", () => {
  it("says what will appear and how to add the first item", () => {
    render(
      <EmptyState
        title="No connection requests yet"
        message="Find people to connect with."
        action={{ label: "Find people", href: "/professionals" }}
      />,
    );
    expect(screen.getByText("No connection requests yet")).toBeTruthy();
    expect(screen.getByText("Find people to connect with.")).toBeTruthy();
    expect(screen.getByText("Find people").closest("a")?.getAttribute("href")).toBe(
      "/professionals",
    );
  });
});

describe("ErrorState", () => {
  it("says what failed in plain words and offers Try again", () => {
    const retry = vi.fn();
    render(<ErrorState message="We couldn't load your connections." onRetry={retry} />);
    expect(screen.getByText("We couldn't load your connections.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("LockedState", () => {
  it("shows the screen name, one line of reason and the path forward", () => {
    render(
      <LockedState
        screenName="Tenders"
        reason="Verify your business to respond."
        action={{ label: "Verify your business", href: "/settings" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Tenders" })).toBeTruthy();
    expect(screen.getByText("Verify your business to respond.")).toBeTruthy();
    expect(screen.getByText("Verify your business").closest("a")?.getAttribute("href")).toBe(
      "/settings",
    );
  });
});

describe("SlowConnectionBanner", () => {
  it("shows a small banner while the connection is slow", () => {
    render(<SlowConnectionBanner slow />);
    expect(screen.getByText(/Slow connection/)).toBeTruthy();
  });

  it("shows nothing when the connection is fine", () => {
    const { container } = render(<SlowConnectionBanner slow={false} />);
    expect(container.textContent).toBe("");
  });
});
