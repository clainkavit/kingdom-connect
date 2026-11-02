import "../test-router";
import { emailSwitchCategories, stringsFor } from "@kingdom-connect/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageContext } from "../lib/language";
import type { StoredNotification } from "../lib/notifications";
import { EmailSwitches, NotificationBell, NotificationList } from "./notifications";

afterEach(cleanup);

const inSwahili = (ui: React.ReactNode) =>
  render(
    <LanguageContext.Provider
      value={{
        language: "sw",
        t: stringsFor("sw"),
        platformName: "Test Platform",
        setLanguage: vi.fn(),
      }}
    >
      {ui}
    </LanguageContext.Provider>,
  );

const item = (over: Partial<StoredNotification> = {}): StoredNotification => ({
  id: "n1",
  kind: "C1",
  payload: { name: "Neema S." },
  read_at: null,
  created_at: "2026-11-02T09:00:00Z",
  ...over,
});

describe("NotificationBell (S09)", () => {
  it("links to the centre and says how many are unread", () => {
    render(<NotificationBell count={3} color="#fff" />);
    const bell = screen.getByLabelText("Notifications, 3 unread");
    expect(bell.getAttribute("href")).toBe("/notifications");
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows no badge when everything is read", () => {
    render(<NotificationBell count={0} color="#fff" />);
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("NotificationList (S09)", () => {
  it("shows each notification in the member's language, with the payload filled in", () => {
    inSwahili(<NotificationList items={[item()]} onOpen={vi.fn()} />);
    expect(screen.getByText("Ombi jipya la kuunganishwa")).toBeTruthy();
    expect(screen.getByText(/Neema S\. anataka kuunganishwa nawe/)).toBeTruthy();
    expect(screen.getByText("2 Novemba 2026")).toBeTruthy();
  });

  it("marks unread ones and opens the one tapped", () => {
    const onOpen = vi.fn();
    render(
      <NotificationList
        items={[item(), item({ id: "n2", read_at: "2026-11-02T10:00:00Z" })]}
        onOpen={onOpen}
      />,
    );
    expect(screen.getAllByLabelText("Unread")).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("link", { name: "New connection request" })[0]!);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "n1" }));
  });

  it("says Nothing new when there is nothing", () => {
    render(<NotificationList items={[]} onOpen={vi.fn()} />);
    expect(screen.getByText("Nothing new")).toBeTruthy();
  });
});

describe("EmailSwitches (S46)", () => {
  it("lists a switch for every non-critical category, on by default", () => {
    render(<EmailSwitches values={{}} onChange={vi.fn()} />);
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(emailSwitchCategories.length);
    for (const s of switches) expect(s.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(/account/i)).toBeTruthy();
  });

  it("turns a category off", () => {
    const onChange = vi.fn();
    render(<EmailSwitches values={{ connections: true }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Email for Connection requests" }));
    expect(onChange).toHaveBeenCalledWith("connections", false);
  });
});
