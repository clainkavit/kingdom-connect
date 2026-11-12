import { addDays, tanzaniaDate } from "@kingdom-connect/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpportunityModerationApi, PendingPost, PostDetail } from "@/lib/opportunities";
import { AdminPostForm, OpportunityQueue, PostReview } from "./opportunity-moderation";

afterEach(cleanup);

const pending = (over: Partial<PendingPost> = {}): PendingPost => ({
  id: "p1",
  title: "Accountant for a farm cooperative",
  type: "job",
  posterName: "Asha Mwita",
  approvedPosts: 1,
  submittedAt: new Date("2026-11-07T09:00:00+03:00"),
  ...over,
});

const detail = (over: Partial<PostDetail> = {}): PostDetail => ({
  id: "p1",
  title: "Accountant for a farm cooperative",
  type: "job",
  role: "Bookkeeper",
  employmentType: "full_time",
  remote: false,
  region: "Mwanza",
  district: "Nyamagana",
  sector: "Agriculture",
  description: "Keep the books for a farm cooperative of forty members.",
  closingOn: "2026-12-07",
  skills: ["bookkeeping", "excel"],
  status: "pending_review",
  posterName: "Asha Mwita",
  approvedPosts: 1,
  reason: null,
  ...over,
});

const fakeApi = (over: Partial<OpportunityModerationApi> = {}): OpportunityModerationApi => ({
  pending: vi.fn().mockResolvedValue([pending()]),
  load: vi.fn().mockResolvedValue(detail()),
  reasons: vi.fn().mockResolvedValue([
    { code: "post_unclear", label: "The post is not clear enough", needsNote: false },
    { code: "other", label: "Other", needsNote: true },
  ]),
  moderate: vi.fn().mockResolvedValue("ok"),
  options: vi.fn().mockResolvedValue({
    sectors: [{ value: "s1", label: "Agriculture" }],
    regions: [{ value: "r1", label: "Mwanza" }],
  }),
  districts: vi.fn().mockResolvedValue([{ value: "d1", label: "Nyamagana" }]),
  post: vi.fn().mockResolvedValue("ok"),
  uploadTenderDocument: vi.fn().mockResolvedValue("staff/doc.pdf"),
  ...over,
});

const click = async (name: string | RegExp) => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })));
};

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

describe("OpportunityQueue (A04)", () => {
  it("lists posts waiting for review, each linking to its review", async () => {
    await show(<OpportunityQueue api={fakeApi()} />);
    expect(screen.getByText("Opportunities (1 waiting)")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Accountant for a farm cooperative/ });
    expect(link.getAttribute("href")).toBe("/moderation/p1");
    expect(screen.getByText(/Asha Mwita · new poster, 1 of 3 reviewed/)).toBeTruthy();
  });

  it("says when nothing is waiting", async () => {
    await show(<OpportunityQueue api={fakeApi({ pending: vi.fn().mockResolvedValue([]) })} />);
    expect(screen.getByText("No opportunities waiting")).toBeTruthy();
  });
});

describe("PostReview (A05)", () => {
  it("shows the whole post and approves it", async () => {
    const api = fakeApi();
    await show(<PostReview api={api} id="p1" />);
    expect(
      screen.getByText("Keep the books for a farm cooperative of forty members."),
    ).toBeTruthy();
    expect(screen.getByText("Mwanza, Nyamagana")).toBeTruthy();
    expect(screen.getByText("bookkeeping, excel")).toBeTruthy();
    expect(screen.getByText("Posted by Asha Mwita")).toBeTruthy();
    await click("Approve");
    expect(api.moderate).toHaveBeenCalledWith("p1", "approve", null, "");
    expect(screen.getByText("Approved. The poster has been told.")).toBeTruthy();
  });

  it("sends a post back only with a reason, and a note when the reason needs one", async () => {
    const api = fakeApi();
    await show(<PostReview api={api} id="p1" />);
    await click("Send back");
    await click("Send back to the poster");
    expect(api.moderate).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByLabelText("Other")));
    await click("Send back to the poster");
    expect(api.moderate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Note/), {
      target: { value: "Say what the job pays." },
    });
    await click("Send back to the poster");
    expect(api.moderate).toHaveBeenCalledWith("p1", "reject", "other", "Say what the job pays.");
    expect(screen.getByText("Sent back. The poster has been told the reason.")).toBeTruthy();
  });

  it("removes a published post with a reason", async () => {
    const api = fakeApi({ load: vi.fn().mockResolvedValue(detail({ status: "published" })) });
    await show(<PostReview api={api} id="p1" />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    await click("Remove");
    await act(async () => fireEvent.click(screen.getByLabelText("The post is not clear enough")));
    await click("Remove the post");
    expect(api.moderate).toHaveBeenCalledWith("p1", "remove", "post_unclear", "");
    expect(screen.getByText("Removed. The poster has been told the reason.")).toBeTruthy();
  });

  it("says when the post is not found", async () => {
    await show(<PostReview api={fakeApi({ load: vi.fn().mockResolvedValue(null) })} id="p9" />);
    expect(screen.getByText("This post was not found.")).toBeTruthy();
  });
});

describe("AdminPostForm (A15)", () => {
  it("publishes at once, with no no-fee tick", async () => {
    const api = fakeApi();
    await show(<AdminPostForm api={api} />);
    expect(screen.queryByLabelText("No fee will be charged to applicants at any stage")).toBeNull();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "partnership" } });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Partner for a bakery in Mwanza" },
    });
    await act(async () => fireEvent.click(screen.getByLabelText("The work is remote")));
    fireEvent.change(screen.getByLabelText("Sector"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Description and requirements"), {
      target: {
        value: "We are looking for a partner to open a second bakery in Mwanza city. ".repeat(2),
      },
    });
    fireEvent.change(screen.getByLabelText("Closing date"), {
      target: { value: addDays(tanzaniaDate(), 20) },
    });
    await click("Publish");
    expect(api.post).toHaveBeenCalledWith(
      expect.objectContaining({ type: "partnership", remote: true, sectorId: "s1", noFee: false }),
    );
    expect(screen.getByText("Published. Members can see it now.")).toBeTruthy();
  });

  it("checks the form before sending", async () => {
    const api = fakeApi();
    await show(<AdminPostForm api={api} />);
    await click("Publish");
    expect(screen.getByText("Choose a type.")).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("posts a tender with its own fields, issued in the platform's name (O04)", async () => {
    const api = fakeApi();
    await show(<AdminPostForm api={api} />);
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "tender" } });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Supply of chairs for the community hall" },
    });
    await act(async () => fireEvent.click(screen.getByLabelText("The work is remote")));
    fireEvent.change(screen.getByLabelText("Sector"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Description and requirements"), {
      target: { value: "We invite verified businesses to supply 200 plastic chairs. ".repeat(2) },
    });
    fireEvent.change(screen.getByLabelText("Closing date"), {
      target: { value: addDays(tanzaniaDate(), 20) },
    });
    await click("Publish");
    expect(screen.getByText(/Check the tender details/)).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Reference number"), {
      target: { value: "KC/T/2026/01" },
    });
    fireEvent.change(screen.getByLabelText("Scope of the work"), {
      target: { value: "Supply and deliver 200 plastic chairs to the hall." },
    });
    fireEvent.change(screen.getByLabelText("Closing time"), { target: { value: "16:00" } });
    await click("Publish");
    expect(api.post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tender",
        tender: expect.objectContaining({ referenceNo: "KC/T/2026/01", closingTime: "16:00" }),
      }),
    );
  });
});
