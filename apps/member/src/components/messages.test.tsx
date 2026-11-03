import { router } from "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessagesApi, Thread } from "../lib/messages";
import { InboxScreen, MessageButton, ThreadScreen } from "./messages";

afterEach(cleanup);

const thread = (over: Partial<Thread> = {}): Thread => ({
  id: "t1",
  otherId: "m2",
  otherName: "Reader Person",
  reported: false,
  canSend: true,
  messages: [
    { id: "a", mine: false, body: "Hello there", deleted: false, createdAt: "", attachments: [] },
    {
      id: "b",
      mine: true,
      body: "Here is my CV",
      deleted: false,
      createdAt: "",
      attachments: [
        { id: "f", fileName: "cv.pdf", mime: "application/pdf", url: "https://files.test/cv" },
      ],
    },
    { id: "c", mine: false, body: "", deleted: true, createdAt: "", attachments: [] },
  ],
  ...over,
});

const fakeApi = (over: Partial<MessagesApi> = {}): MessagesApi => ({
  threads: vi.fn().mockResolvedValue([]),
  openThread: vi.fn().mockResolvedValue("t1"),
  load: vi.fn().mockResolvedValue(thread()),
  send: vi.fn().mockResolvedValue(true),
  remove: vi.fn().mockResolvedValue(true),
  markRead: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockReturnValue(() => undefined),
  pickFile: vi.fn().mockResolvedValue(null),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

async function showThread(api: MessagesApi) {
  await act(async () => {
    render(<ThreadScreen api={api} threadId="t1" />);
  });
}

describe("InboxScreen (S14)", () => {
  it("lists threads with the last message and an unread mark", async () => {
    const api = fakeApi({
      threads: vi.fn().mockResolvedValue([
        {
          threadId: "t1",
          otherId: "m2",
          fullName: "Reader Person",
          photoUrl: null,
          lastBody: "See you Sunday",
          lastDeleted: false,
          lastAt: "",
          unread: true,
        },
      ]),
    });
    await act(async () => {
      render(<InboxScreen api={api} />);
    });
    expect(screen.getByRole("link", { name: "Reader Person, Unread" }).getAttribute("href")).toBe(
      "/messages/t1",
    );
    expect(screen.getByText("See you Sunday")).toBeTruthy();
  });

  it("says when there are no messages", async () => {
    await act(async () => {
      render(<InboxScreen api={fakeApi()} />);
    });
    expect(screen.getByText("No messages yet")).toBeTruthy();
  });
});

describe("ThreadScreen (S15)", () => {
  it("shows the messages, the attachment and deleted ones, and marks the thread read", async () => {
    const api = fakeApi();
    await showThread(api);
    expect(screen.getByText("Hello there")).toBeTruthy();
    expect(screen.getByRole("link", { name: "cv.pdf" })).toBeTruthy();
    expect(screen.getByText("This message was deleted")).toBeTruthy();
    expect(api.markRead).toHaveBeenCalledWith("t1");
    expect(api.subscribe).toHaveBeenCalledWith("t1", expect.any(Function));
    expect(screen.getByRole("link", { name: "Report" }).getAttribute("href")).toBe(
      "/report?type=thread&id=t1&member=m2",
    );
  });

  it("sends text", async () => {
    const api = fakeApi();
    await showThread(api);
    fireEvent.change(screen.getByLabelText("Write a message"), { target: { value: "Thank you" } });
    await click("Send");
    expect(api.send).toHaveBeenCalledWith("t1", "Thank you", null);
  });

  it("refuses a file that is too large or the wrong type before sending", async () => {
    const pickFile = vi
      .fn()
      .mockResolvedValueOnce({
        uri: "x",
        name: "big.pdf",
        mime: "application/pdf",
        size: 11 * 1024 * 1024,
      })
      .mockResolvedValueOnce({
        uri: "x",
        name: "notes.docx",
        mime: "application/msword",
        size: 100,
      });
    const api = fakeApi({ pickFile });
    await showThread(api);
    await click("Attach a file");
    expect(screen.getByRole("alert").textContent).toBe("This file is larger than 10 MB.");
    await click("Attach a file");
    expect(screen.getByRole("alert").textContent).toMatch(/Only PDF and image files/);
    expect(api.send).not.toHaveBeenCalled();
  });

  it("deletes your own message after confirming", async () => {
    const api = fakeApi();
    await showThread(api);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
    await click("Delete");
    await click("Yes, delete");
    expect(api.remove).toHaveBeenCalledWith("b");
  });

  it("shows the report notice and no deleting in a reported thread", async () => {
    await showThread(fakeApi({ load: vi.fn().mockResolvedValue(thread({ reported: true })) }));
    expect(
      screen.getByText("This conversation was reported. Administrators can read it."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("does not offer sending when the members are no longer connected", async () => {
    await showThread(fakeApi({ load: vi.fn().mockResolvedValue(thread({ canSend: false })) }));
    expect(screen.getByText("You can't send messages in this conversation.")).toBeTruthy();
    expect(screen.queryByLabelText("Write a message")).toBeNull();
  });
});

describe("MessageButton", () => {
  it("opens the thread with a connection", async () => {
    const api = fakeApi();
    render(<MessageButton memberId="m2" api={api} />);
    await click("Message");
    expect(api.openThread).toHaveBeenCalledWith("m2");
    expect(router.pushed).toContain("/messages/t1");
  });
});
