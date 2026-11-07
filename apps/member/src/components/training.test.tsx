import { router } from "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterialsApi } from "../lib/materials";
import type { TrainingApi, TrainingItem } from "../lib/training";
import { TrainingDetail, TrainingForm, TrainingList } from "./training";

afterEach(cleanup);

const item = (over: Partial<TrainingItem> = {}): TrainingItem => ({
  id: "t1",
  title: "Bookkeeping basics",
  provider: "Mwanza Business Centre",
  format: "in_person",
  details: "Simple bookkeeping for small businesses.",
  venue: "Mkuyuni church hall",
  startsAt: null,
  seats: 2,
  registered: 1,
  downloadsAllowed: false,
  status: "published",
  reviewReason: null,
  isMine: false,
  myStatus: null,
  myWaitlistPosition: null,
  ...over,
});

const fakeApi = (over: Partial<TrainingApi> = {}): TrainingApi => ({
  feed: vi.fn().mockResolvedValue([item()]),
  canPost: vi.fn().mockResolvedValue(true),
  save: vi.fn().mockResolvedValue({ result: "pending_review", trainingId: "t9" }),
  register: vi.fn().mockResolvedValue({ result: "registered", waitlistPosition: null }),
  cancel: vi.fn().mockResolvedValue("ok"),
  registrants: vi.fn().mockResolvedValue([]),
  ...over,
});

const fakeMaterials = (over: Partial<MaterialsApi> = {}): MaterialsApi => ({
  list: vi.fn().mockResolvedValue([]),
  canManage: vi.fn().mockResolvedValue(false),
  fileUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  pickPdf: vi.fn().mockResolvedValue(null),
  addFile: vi.fn().mockResolvedValue("ok"),
  addLink: vi.fn().mockResolvedValue("ok"),
  remove: vi.fn().mockResolvedValue("ok"),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

describe("TrainingList (S35)", () => {
  it("lists training with the provider, self-paced and seats left", async () => {
    await show(<TrainingList api={fakeApi()} />);
    expect(screen.getByText("By Mwanza Business Centre")).toBeTruthy();
    expect(screen.getByText("Self-paced · Mkuyuni church hall")).toBeTruthy();
    expect(screen.getByText("1 of 2 seats left")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Post a training" }).getAttribute("href")).toBe(
      "/training/new",
    );
  });

  it("explains when the member's posting is paused", async () => {
    await show(<TrainingList api={fakeApi({ canPost: vi.fn().mockResolvedValue(false) })} />);
    expect(
      screen.getByText("Your posting is paused, so you can't post training right now."),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Post a training" })).toBeNull();
  });
});

describe("TrainingDetail (S35)", () => {
  it("joins the waitlist when full, and cancels a seat", async () => {
    const full = fakeApi({ feed: vi.fn().mockResolvedValue([item({ registered: 2 })]) });
    await show(<TrainingDetail api={full} materials={fakeMaterials()} trainingId="t1" />);
    expect(screen.getByText("Register to open the learning materials.")).toBeTruthy();
    await click("Join the waitlist");
    expect(full.register).toHaveBeenCalledWith("t1");
    cleanup();

    const mine = fakeApi({ feed: vi.fn().mockResolvedValue([item({ myStatus: "registered" })]) });
    await show(<TrainingDetail api={mine} materials={fakeMaterials()} trainingId="t1" />);
    expect(screen.getByText("No materials yet.")).toBeTruthy();
    await click("Cancel my seat");
    expect(mine.cancel).toHaveBeenCalledWith("t1");
  });

  it("shows the poster the registrants by name only", async () => {
    await show(
      <TrainingDetail
        api={fakeApi({
          feed: vi.fn().mockResolvedValue([item({ isMine: true })]),
          registrants: vi.fn().mockResolvedValue([
            {
              memberId: "m2",
              fullName: "Neema Joseph",
              headline: "Teacher",
              status: "registered",
              waitlistPosition: null,
            },
          ]),
        })}
        materials={fakeMaterials()}
        trainingId="t1"
      />,
    );
    expect(screen.getByRole("link", { name: "Neema Joseph" })).toBeTruthy();
    expect(screen.queryByText(/@|\+255/)).toBeNull();
  });
});

describe("TrainingForm (S37)", () => {
  it("sends self-paced online training for review", async () => {
    const api = fakeApi();
    await show(<TrainingForm api={api} trainingId={null} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Savings groups" } });
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "Asha Mwita" } });
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Online" })));
    expect(screen.queryByLabelText("Venue")).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Self-paced, no fixed date" })),
    );
    expect(screen.queryByLabelText("Date")).toBeNull();
    fireEvent.change(screen.getByLabelText("Seats"), { target: { value: "50" } });
    await click("Send for review");
    expect(api.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ format: "online", selfPaced: true, seats: "50" }),
      true,
    );
    expect(router.pushed).toContain("/training/t9");
  });

  it("asks for a venue for in-person training", async () => {
    const api = fakeApi();
    await show(<TrainingForm api={api} trainingId={null} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Savings groups" } });
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "Asha Mwita" } });
    await click("Send for review");
    expect(screen.getByRole("alert").textContent).toBe(
      "In-person training needs a venue of at least 3 characters.",
    );
    expect(api.save).not.toHaveBeenCalled();
  });
});
