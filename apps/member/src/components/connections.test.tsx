import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionsApi } from "../lib/connections";
import { BlockedList, ConnectionsScreen, ConnectPanel } from "./connections";

afterEach(cleanup);

const person = (memberId: string, fullName: string) => ({
  memberId,
  fullName,
  headline: "",
  photoUrl: null,
});

const fakeApi = (over: Partial<ConnectionsApi> = {}): ConnectionsApi => ({
  received: vi.fn().mockResolvedValue([]),
  sent: vi.fn().mockResolvedValue([]),
  connections: vi.fn().mockResolvedValue([]),
  relation: vi.fn().mockResolvedValue("none"),
  send: vi.fn().mockResolvedValue("sent"),
  answer: vi.fn().mockResolvedValue(true),
  withdraw: vi.fn().mockResolvedValue(true),
  remove: vi.fn().mockResolvedValue(true),
  block: vi.fn().mockResolvedValue(true),
  unblock: vi.fn().mockResolvedValue(true),
  blocked: vi.fn().mockResolvedValue([]),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("ConnectionsScreen (S13)", () => {
  it("lists requests received with the note, requests sent and connections", async () => {
    const api = fakeApi({
      received: vi
        .fn()
        .mockResolvedValue([{ ...person("a", "Asker Person"), requestId: "r1", note: "Hello" }]),
      sent: vi.fn().mockResolvedValue([{ ...person("b", "Waiting Person"), requestId: "r2" }]),
      connections: vi.fn().mockResolvedValue([person("c", "Friend Person")]),
    });
    await act(async () => {
      render(<ConnectionsScreen api={api} />);
    });
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByText("Waiting Person")).toBeTruthy();
    expect(screen.getByText("Request sent")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Friend Person" }).getAttribute("href")).toBe(
      "/profile/c",
    );

    await click("Accept");
    expect(api.answer).toHaveBeenCalledWith("r1", true);
    await click("Withdraw");
    expect(api.withdraw).toHaveBeenCalledWith("r2");
    await click("Remove");
    expect(screen.getByText(/Remove Friend Person from your connections\?/)).toBeTruthy();
    await click("Yes, remove");
    expect(api.remove).toHaveBeenCalledWith("c");
  });

  it("points to the directory when there are no requests", async () => {
    await act(async () => {
      render(<ConnectionsScreen api={fakeApi()} />);
    });
    expect(screen.getByText("No requests yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find people" }).getAttribute("href")).toBe("/people");
  });
});

describe("ConnectPanel (S11)", () => {
  async function show(api: ConnectionsApi, startWriting = false, onBlocked = vi.fn()) {
    await act(async () => {
      render(
        <ConnectPanel
          memberId="m1"
          name="Other Person"
          api={api}
          startWriting={startWriting}
          onBlocked={onBlocked}
        />,
      );
    });
    return onBlocked;
  }

  it("sends a request with a note, then shows it as sent", async () => {
    const api = fakeApi();
    await show(api);
    await click("Connect");
    fireEvent.change(screen.getByLabelText("Add a note (optional)"), {
      target: { value: "We met at church." },
    });
    await click("Send request");
    expect(api.send).toHaveBeenCalledWith("m1", "We met at church.");
    expect(screen.getByText("Request sent")).toBeTruthy();
  });

  it("shows Connected when the other member had asked first and their request was accepted", async () => {
    const api = fakeApi({ send: vi.fn().mockResolvedValue("connected") });
    await show(api, true);
    await click("Send request");
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("says when the daily limit is reached", async () => {
    await show(fakeApi({ send: vi.fn().mockResolvedValue("daily_limit") }), true);
    await click("Send request");
    expect(screen.getByRole("alert").textContent).toBe(
      "You have sent 30 requests today. Try again tomorrow",
    );
  });

  it("will not send a note over 300 characters", async () => {
    await show(fakeApi(), true);
    fireEvent.change(screen.getByLabelText("Add a note (optional)"), {
      target: { value: "x".repeat(301) },
    });
    expect(screen.getByRole("button", { name: "Send request" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("sends a Member who was asked first to Connections to answer", async () => {
    await show(fakeApi({ relation: vi.fn().mockResolvedValue("received") }));
    expect(screen.getByRole("link", { name: "Answer their request" }).getAttribute("href")).toBe(
      "/connections",
    );
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("blocks only after confirming", async () => {
    const api = fakeApi({ relation: vi.fn().mockResolvedValue("connected") });
    const onBlocked = await show(api);
    expect(screen.getByText("Connected")).toBeTruthy();
    await click("Block");
    expect(api.block).not.toHaveBeenCalled();
    expect(screen.getByText(/Block Other Person\?/)).toBeTruthy();
    await click("Yes, block");
    expect(api.block).toHaveBeenCalledWith("m1");
    expect(onBlocked).toHaveBeenCalled();
  });
});

describe("BlockedList (S45)", () => {
  it("offers Try again when the list cannot load, instead of saying no one is blocked", async () => {
    const blocked = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([{ memberId: "x", fullName: "Blocked Person" }]);
    await act(async () => {
      render(<BlockedList api={fakeApi({ blocked })} />);
    });
    expect(screen.queryByText("You haven't blocked anyone.")).toBeNull();
    await click("Try again");
    expect(screen.getByText("Blocked Person")).toBeTruthy();
  });

  it("unblocks a member", async () => {
    const api = fakeApi({
      blocked: vi.fn().mockResolvedValue([{ memberId: "x", fullName: "Blocked Person" }]),
    });
    await act(async () => {
      render(<BlockedList api={api} />);
    });
    await click("Unblock Blocked Person");
    expect(api.unblock).toHaveBeenCalledWith("x");
    expect(screen.getByText("Unblocking does not bring back a connection.")).toBeTruthy();
  });
});
