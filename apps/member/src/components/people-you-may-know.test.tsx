import "../test-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PeopleYouMayKnowApi, Suggestion } from "../lib/people-you-may-know";
import { PeopleYouMayKnow } from "./people-you-may-know";

afterEach(cleanup);

const suggestion = (over: Partial<Suggestion> = {}): Suggestion => ({
  memberId: "m5",
  fullName: "Asha Mwita",
  photoUrl: null,
  headline: "Bookkeeper in Moshi",
  profession: "Accountant",
  mutualConnections: 2,
  reasons: [
    { code: "mutual", count: 2 },
    { code: "skills", skills: ["bookkeeping"] },
  ],
  ...over,
});

const show = (api: PeopleYouMayKnowApi) =>
  act(async () => {
    render(<PeopleYouMayKnow api={api} />);
  });

describe("PeopleYouMayKnow (S08, O08)", () => {
  it("shows each suggestion with two reasons and a way to connect", async () => {
    const list = vi.fn().mockResolvedValue([suggestion()]);
    await show({ list });
    expect(list).toHaveBeenCalledWith(6);
    expect(screen.getByText("Asha Mwita")).toBeTruthy();
    expect(screen.getByText("2 mutual connections · Shared skills: bookkeeping")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect with Asha Mwita" }).getAttribute("href")).toBe(
      "/profile/m5",
    );
  });

  it("words the other reasons, and the newest members in the region", async () => {
    await show({
      list: vi.fn().mockResolvedValue([
        suggestion({
          memberId: "a",
          reasons: [{ code: "location", kind: "district" }, { code: "profession" }],
        }),
        suggestion({
          memberId: "b",
          fullName: "Juma Said",
          headline: null,
          reasons: [{ code: "newest_in_region" }],
        }),
      ]),
    });
    expect(screen.getByText("In your district · Same profession")).toBeTruthy();
    expect(screen.getByText("New in your region")).toBeTruthy();
    expect(screen.getByText("Accountant")).toBeTruthy();
  });

  it("names no mutual connection, only a count", async () => {
    await show({ list: vi.fn().mockResolvedValue([suggestion()]) });
    expect(screen.queryByText(/mutual connections?:/i)).toBeNull();
  });

  it("asks for a fuller profile when there is nothing to suggest", async () => {
    await show({ list: vi.fn().mockResolvedValue([]) });
    expect(screen.getByText("Complete your profile to see suggestions")).toBeTruthy();
  });
});
