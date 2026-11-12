import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile, ProfileApi } from "../lib/profile";
import { ProfileEditor, ProfileView } from "./profile";

afterEach(cleanup);

const profile = (over: Partial<Profile> = {}): Profile => ({
  memberId: "m1",
  own: false,
  fullName: "Test Member",
  headline: "Accountant in Mwanza",
  bio: "I help small shops keep their books.",
  profession: "Accountant",
  experience: "",
  certifications: "",
  regionId: "r1",
  districtId: "d1",
  location: "Nyamagana, Mwanza",
  study: { institution: "", course: "", year: null },
  skills: ["bookkeeping", "excel"],
  photoUrl: null,
  hidden: false,
  contact: null,
  ...over,
});

const fakeApi = (over: Partial<ProfileApi> = {}): ProfileApi => ({
  load: vi.fn(),
  save: vi.fn().mockResolvedValue(true),
  setSkills: vi.fn().mockResolvedValue("done"),
  suggestSkills: vi.fn().mockResolvedValue([]),
  pickAndUploadPhoto: vi.fn().mockResolvedValue("https://photos.test/me"),
  regions: vi.fn().mockResolvedValue([{ value: "r1", label: "Mwanza" }]),
  districts: vi.fn().mockResolvedValue([{ value: "d1", label: "Nyamagana" }]),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("ProfileView (S11)", () => {
  it("shows another member's profile with no contact details and no Edit", () => {
    render(<ProfileView profile={profile()} />);
    expect(screen.getByText("Test Member")).toBeTruthy();
    expect(screen.getByText("Accountant in Mwanza")).toBeTruthy();
    expect(screen.getByText("Nyamagana, Mwanza")).toBeTruthy();
    expect(screen.getByText("bookkeeping")).toBeTruthy();
    expect(screen.getByText("Ideas will appear here once the Ideas pool opens.")).toBeTruthy();
    expect(screen.queryByText(/@|\+255/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit profile" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Contact" })).toBeNull();
  });

  it("shows a connection only the contact details they share", () => {
    render(
      <ProfileView
        profile={profile({ contact: { phone: "+255700000001", email: null, address: null } })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Contact" })).toBeTruthy();
    expect(screen.getByText("+255700000001")).toBeTruthy();
    expect(screen.queryByText("Email")).toBeNull();
    expect(screen.queryByText("Address")).toBeNull();
  });

  it("offers Edit, the skills nudge and the hidden note on your own profile", () => {
    render(<ProfileView profile={profile({ own: true, skills: [], hidden: true })} />);
    expect(screen.getByRole("link", { name: "Edit profile" }).getAttribute("href")).toBe(
      "/profile/edit",
    );
    expect(screen.getByText("Add skills to get matched.")).toBeTruthy();
    expect(screen.getByText(/Your profile is hidden from the directory/)).toBeTruthy();
  });

  it("lists the next steps on your own profile, with a link for each missing one and Scan last", () => {
    render(<ProfileView profile={profile({ own: true, skills: [], districtId: null })} />);
    expect(screen.getByRole("heading", { name: "Next steps" })).toBeTruthy();
    expect(screen.getByText("1 of 4 done")).toBeTruthy();
    for (const name of ["Add a profile photo", "Add your district", "Add your skills"])
      expect(screen.getByRole("link", { name }).getAttribute("href")).toBe("/profile/edit");
    expect(screen.queryByRole("link", { name: "Add your profession" })).toBeNull();
    expect(screen.getByText("Add your profession")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add skills" }).getAttribute("href")).toBe(
      "/profile/edit",
    );
    expect(screen.getByRole("link", { name: "Scan for opportunities" }).getAttribute("href")).toBe(
      "/opportunities/scan",
    );
  });

  it("shrinks to one line once the profile is ready", () => {
    render(<ProfileView profile={profile({ own: true, photoUrl: "https://photos.test/me" })} />);
    expect(screen.queryByRole("heading", { name: "Next steps" })).toBeNull();
    expect(screen.getByText("Your profile is ready.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Scan for opportunities" })).toBeTruthy();
  });

  it("offers to add an empty About on your own profile, and says Not given to others", () => {
    const empty = { profession: "", bio: "", headline: "" };
    render(<ProfileView profile={profile({ own: true, ...empty })} />);
    expect(screen.getByRole("link", { name: "Add something about you" })).toBeTruthy();
    cleanup();
    render(<ProfileView profile={profile(empty)} />);
    expect(screen.queryByRole("link", { name: "Add something about you" })).toBeNull();
    expect(screen.getByText("Not given")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Next steps" })).toBeNull();
  });
});

describe("ProfileEditor (S12)", () => {
  async function show(api: ProfileApi, initial = profile({ own: true }), onSaved = vi.fn()) {
    await act(async () => {
      render(<ProfileEditor initial={initial} api={api} onSaved={onSaved} />);
    });
    return onSaved;
  }

  it("keeps the verified name locked", async () => {
    await show(fakeApi());
    expect(screen.getByText("Test Member")).toBeTruthy();
    expect(
      screen.getByText("Your name matches your ID. To change it, ask an Administrator."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Full name, as on your ID")).toBeNull();
  });

  it("adds a skill from a suggestion, removes one, and saves", async () => {
    const api = fakeApi({ suggestSkills: vi.fn().mockResolvedValue(["javascript"]) });
    const onSaved = await show(api);
    await act(async () =>
      fireEvent.change(screen.getByLabelText("Add a skill"), { target: { value: "js" } }),
    );
    await click("javascript");
    await click("Remove excel");
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Bookkeeper" } });
    await click("Save profile");
    expect(api.setSkills).toHaveBeenCalledWith(["bookkeeping", "javascript"]);
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ headline: "Bookkeeper" }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("normalizes a typed skill and refuses one that is too long", async () => {
    const api = fakeApi();
    await show(api, profile({ own: true, skills: [] }));
    fireEvent.change(screen.getByLabelText("Add a skill"), {
      target: { value: "  Project   Management " },
    });
    await click("Add");
    expect(screen.getByText("project management")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Add a skill"), { target: { value: "a".repeat(41) } });
    await click("Add");
    expect(screen.getByText("A skill can be up to 40 characters.")).toBeTruthy();
  });

  it("will not save a headline that is too long", async () => {
    const api = fakeApi();
    await show(api);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "x".repeat(121) } });
    await click("Save profile");
    expect(api.save).not.toHaveBeenCalled();
    expect(screen.getByText("This can be up to 120 characters.")).toBeTruthy();
  });

  it("links to privacy settings instead of holding the hide switch", async () => {
    await show(fakeApi());
    expect(
      screen.getByRole("link", { name: "Privacy and contact sharing" }).getAttribute("href"),
    ).toBe("/settings/privacy");
    expect(
      screen.queryByRole("checkbox", { name: "Hide my profile from the directory" }),
    ).toBeNull();
  });

  it("says when saving failed", async () => {
    const onSaved = await show(fakeApi({ save: vi.fn().mockResolvedValue(false) }));
    await click("Save profile");
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't save your profile/);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
