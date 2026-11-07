import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdeaDetails, IdeaDetailsApi } from "../lib/idea-details";
import { fakeAccess } from "./idea-access.fake";
import { IdeaDetailsScreen } from "./idea-details";

afterEach(cleanup);

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

const click = async (name: string) => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })));
};

const details = (over: Partial<IdeaDetails> = {}): IdeaDetails => ({
  title: "Solar dryers",
  description: "A low-cost solar dryer built from local materials.",
  businessModel: "Sell to farm groups",
  market: "",
  financials: "Pays back in one season.",
  team: "",
  isOwner: false,
  viewerName: "Neema Joseph",
  openedAt: "2026-11-07T09:00:00Z",
  ...over,
});

const fakeApi = (over: Partial<IdeaDetailsApi> = {}): IdeaDetailsApi => ({
  open: vi.fn().mockResolvedValue(details()),
  files: vi
    .fn()
    .mockResolvedValue([
      { id: "f1", fileName: "Business plan.pdf", mime: "application/pdf", size: 1048576 },
    ]),
  openFile: vi.fn().mockResolvedValue("blob:stamped"),
  pickFile: vi.fn().mockResolvedValue(null),
  addFile: vi.fn().mockResolvedValue("ok"),
  removeFile: vi.fn().mockResolvedValue(true),
  ...over,
});

describe("IdeaDetailsScreen (S26)", () => {
  it("shows the details stamped with the viewer's name and date", async () => {
    await show(<IdeaDetailsScreen api={fakeApi()} access={fakeAccess()} ideaId="i1" />);
    expect(screen.getByText("Pays back in one season.")).toBeTruthy();
    expect(screen.getByText(/^Opened by Neema Joseph · .+ · Confidential\./)).toBeTruthy();
    expect(
      screen.getAllByText(/Neema Joseph · .+ · Confidential Neema Joseph/).length,
    ).toBeGreaterThan(1);
    expect(screen.queryByText("Market")).toBeNull();
  });

  it("opens a file through the stamped link, with no download toolbar", async () => {
    const api = fakeApi();
    const { container } = render(<IdeaDetailsScreen api={api} access={fakeAccess()} ideaId="i1" />);
    await act(async () => undefined);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a file" })).toBeNull();
    await click("Open");
    expect(api.openFile).toHaveBeenCalledWith("f1");
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(
      "blob:stamped#toolbar=0&navpanes=0",
    );
  });

  it("tells a revoked requester the owner removed their access", async () => {
    const open = vi.fn().mockResolvedValue(null);
    const myRequest = vi.fn().mockResolvedValue({
      id: "r1",
      status: "revoked",
      role: "partner",
      anonymous: false,
    });
    await show(
      <IdeaDetailsScreen api={fakeApi({ open })} access={fakeAccess({ myRequest })} ideaId="i1" />,
    );
    expect(screen.getByText("The owner has removed your access.")).toBeTruthy();
    expect(screen.queryByText("Pays back in one season.")).toBeNull();
  });

  it("lets the owner add and remove files within 20 MB", async () => {
    const pickFile = vi.fn().mockResolvedValue({
      uri: "file:///big.pdf",
      name: "Big.pdf",
      mime: "application/pdf",
      size: 20 * 1024 * 1024,
    });
    const api = fakeApi({ open: vi.fn().mockResolvedValue(details({ isOwner: true })), pickFile });
    await show(<IdeaDetailsScreen api={api} access={fakeAccess()} ideaId="i1" />);
    await click("Add a file");
    expect(screen.getByText("All files together can be at most 20 MB.")).toBeTruthy();
    expect(api.addFile).not.toHaveBeenCalled();
    pickFile.mockResolvedValue({
      uri: "file:///p.png",
      name: "Prototype.png",
      mime: "image/png",
      size: 10,
    });
    await click("Add a file");
    expect(api.addFile).toHaveBeenCalledWith(
      "i1",
      expect.objectContaining({ name: "Prototype.png" }),
    );
    await click("Remove");
    await click("Remove");
    expect(api.removeFile).toHaveBeenCalledWith("f1");
  });
});
