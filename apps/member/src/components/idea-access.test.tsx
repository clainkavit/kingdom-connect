import { router } from "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestCard } from "../lib/idea-access";
import { AccessManager, IdeaInterest } from "./idea-access";
import { fakeAccess } from "./idea-access.fake";

afterEach(cleanup);

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

const click = async (role: string, name: string | RegExp) => {
  await act(async () => fireEvent.click(screen.getByRole(role, { name })));
};

const card = (over: Partial<RequestCard> = {}): RequestCard => ({
  id: "r1",
  status: "pending",
  role: "partner",
  anonymous: false,
  requesterId: "m2",
  requesterName: "Neema Joseph",
  requesterHeadline: "Farmer",
  sectorEn: null,
  sectorSw: null,
  ticketBand: null,
  ...over,
});

describe("IdeaInterest (S24)", () => {
  it("records the view and sends interest with the chosen role", async () => {
    const express = vi.fn().mockResolvedValue("ok");
    const recordView = vi.fn().mockResolvedValue(undefined);
    const myRequest = vi.fn().mockResolvedValue(null);
    await show(<IdeaInterest api={fakeAccess({ express, recordView, myRequest })} ideaId="i1" />);
    expect(recordView).toHaveBeenCalledWith("i1");
    expect(screen.queryByRole("checkbox")).toBeNull();
    await click("button", "I'm interested");
    expect(express).not.toHaveBeenCalled();
    myRequest.mockResolvedValue({ status: "pending", role: "partner", anonymous: false });
    await click("radio", "Partner");
    await click("button", "I'm interested");
    expect(express).toHaveBeenCalledWith("i1", "partner", false);
    expect(
      screen.getByText("Your request was sent. The owner decides who sees the details."),
    ).toBeTruthy();
  });

  it("lets an investor ask anonymously, always as investor", async () => {
    const express = vi.fn().mockResolvedValue("ok");
    const isInvestor = vi.fn().mockResolvedValue(true);
    await show(<IdeaInterest api={fakeAccess({ express, isInvestor })} ideaId="i1" />);
    await click("checkbox", "Ask anonymously as a verified investor");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    await click("button", "I'm interested");
    expect(express).toHaveBeenCalledWith("i1", "investor", true);
  });

  it("shows where an existing request stands", async () => {
    const myRequest = vi.fn().mockResolvedValue({
      status: "revoked",
      role: "partner",
      anonymous: false,
    });
    await show(<IdeaInterest api={fakeAccess({ myRequest })} ideaId="i1" />);
    expect(screen.getByText("The owner has removed your access.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "I'm interested" })).toBeNull();
  });
});

describe("AccessManager (S28)", () => {
  it("shows the view count and an anonymous investor without any identity", async () => {
    const requests = vi.fn().mockResolvedValue([
      card(),
      card({
        id: "r2",
        role: "investor",
        anonymous: true,
        requesterId: null,
        requesterName: null,
        requesterHeadline: null,
        sectorEn: "Agriculture",
        ticketBand: "10m_to_50m",
      }),
    ]);
    const viewCount = vi.fn().mockResolvedValue(1);
    await show(<AccessManager api={fakeAccess({ requests, viewCount })} ideaId="i1" />);
    expect(screen.getByText("Viewed by 1 investor")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Neema Joseph" }).getAttribute("href")).toBe(
      "/profile/m2",
    );
    expect(screen.getByText("A verified investor")).toBeTruthy();
    expect(screen.getByText("Agriculture · TZS 10M to 50M")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(2);
  });

  it("approves, declines and removes access", async () => {
    const decide = vi.fn().mockResolvedValue("ok");
    const revoke = vi.fn().mockResolvedValue("ok");
    const requests = vi.fn().mockResolvedValue([card()]);
    await show(<AccessManager api={fakeAccess({ requests, decide, revoke })} ideaId="i1" />);
    requests.mockResolvedValue([card({ status: "approved" })]);
    await click("button", "Approve");
    expect(decide).toHaveBeenCalledWith("r1", true);
    expect(
      screen.getByText("Wants to join as Partner · Approved, waiting for the NDA"),
    ).toBeTruthy();
    await click("button", "Remove access");
    await click("button", "Remove access");
    expect(revoke).toHaveBeenCalledWith("r1");
  });

  it("says when nobody has asked yet", async () => {
    await show(<AccessManager api={fakeAccess()} ideaId="i1" />);
    expect(screen.getByText("No requests yet")).toBeTruthy();
    expect(screen.getByText("Viewed by 0 investors")).toBeTruthy();
  });
});

describe("IdeaTerms (S25)", () => {
  const texts = [
    {
      id: "ip1",
      kind: "ip" as const,
      version: "1.0",
      body_en: "IP terms",
      body_sw: "Masharti",
      approved_at: "2026-11-01",
    },
    {
      id: "nda1",
      kind: "nda" as const,
      version: "1.0",
      body_en: "The NDA",
      body_sw: "NDA",
      approved_at: "2026-11-01",
    },
  ];

  it("asks an approved requester to accept both texts, then opens the thread", async () => {
    const myRequest = vi.fn().mockResolvedValue({
      id: "r1",
      status: "approved",
      role: "partner",
      anonymous: false,
    });
    const acceptTerms = vi.fn().mockResolvedValue("ok");
    const terms = vi.fn().mockResolvedValue(texts);
    const thread = vi.fn().mockResolvedValue("t9");
    await show(
      <IdeaInterest api={fakeAccess({ myRequest, acceptTerms, terms, thread })} ideaId="i1" />,
    );
    expect(terms).toHaveBeenCalledWith("r1");
    expect(screen.getByText("The NDA")).toBeTruthy();
    const accept = screen.getByRole("button", { name: "Accept and open the details" });
    expect(accept.getAttribute("aria-disabled")).toBe("true");
    for (const box of screen.getAllByRole("checkbox")) {
      await act(async () => fireEvent.click(box));
    }
    myRequest.mockResolvedValue({
      id: "r1",
      status: "nda_accepted",
      role: "partner",
      anonymous: false,
    });
    await click("button", "Accept and open the details");
    expect(acceptTerms).toHaveBeenCalledWith("r1", ["ip1", "nda1"]);
    expect(screen.getByText("You have access to the details.")).toBeTruthy();
    await click("button", "Message the owner");
    expect(thread).toHaveBeenCalledWith("i1", null);
    expect(router.pushed).toContain("/messages/t9");
  });

  it("shows the new version when the terms changed while reading", async () => {
    const myRequest = vi.fn().mockResolvedValue({
      id: "r1",
      status: "approved",
      role: "partner",
      anonymous: false,
    });
    const acceptTerms = vi.fn().mockResolvedValue("texts_changed");
    const terms = vi.fn().mockResolvedValue(texts);
    await show(<IdeaInterest api={fakeAccess({ myRequest, acceptTerms, terms })} ideaId="i1" />);
    for (const box of screen.getAllByRole("checkbox")) {
      await act(async () => fireEvent.click(box));
    }
    await click("button", "Accept and open the details");
    expect(
      screen.getByText("The terms were just updated. Read the new version and accept again."),
    ).toBeTruthy();
    expect(terms).toHaveBeenCalledTimes(2);
  });

  it("lets the owner message a requester past the NDA", async () => {
    const thread = vi.fn().mockResolvedValue("t9");
    const requests = vi.fn().mockResolvedValue([card({ status: "nda_accepted" })]);
    await show(<AccessManager api={fakeAccess({ requests, thread })} ideaId="i1" />);
    await click("button", "Message");
    expect(thread).toHaveBeenCalledWith("i1", "m2");
  });
});
