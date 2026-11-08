import { router } from "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdeasApi, MyIdea } from "../lib/ideas";
import { IdeaForm, MyIdeas } from "./ideas";

afterEach(cleanup);

const idea = (over: Partial<MyIdea> = {}): MyIdea => ({
  id: "i1",
  title: "Solar dryers for fruit farmers",
  status: "published",
  reviewReason: null,
  showOwner: true,
  draft: {
    title: "Solar dryers for fruit farmers",
    problem: "Farmers lose much of their mango harvest before market.",
    sectorId: "s1",
    stage: "prototype",
    seeking: "investor",
    investmentMin: "",
    investmentMax: "",
    showOwner: true,
    description: "A low-cost solar dryer built from local materials for farm groups to share.",
    businessModel: "",
    market: "",
    financials: "",
    team: "",
  },
  ...over,
});

const fakeApi = (over: Partial<IdeasApi> = {}): IdeasApi => ({
  mine: vi.fn().mockResolvedValue([idea()]),
  sectors: vi.fn().mockResolvedValue([{ value: "s1", label: "Agriculture" }]),
  save: vi.fn().mockResolvedValue({ result: "pending_moderation", ideaId: "i9" }),
  archive: vi.fn().mockResolvedValue("ok"),
  ...over,
});

async function show(node: React.ReactElement) {
  await act(async () => {
    render(node);
  });
}

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

const twoIdeas = [
  idea({ id: "i1", status: "draft", reviewReason: "Remove the price list" }),
  idea({ id: "i2", title: "Clinic booking", status: "pending_moderation", showOwner: false }),
];

describe("MyIdeas (S27)", () => {
  it("shows each idea's status, a sent-back reason and an idea shared without a name", async () => {
    await show(
      <MyIdeas
        api={fakeApi({
          mine: vi.fn().mockResolvedValue(twoIdeas),
        })}
      />,
    );
    expect(screen.getByText("Not approved: Remove the price list")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/ideas/new?id=i1",
    );
    expect(screen.getByText("Waiting for moderation · Shared without your name")).toBeTruthy();
  });

  it("archives a published idea after a confirm", async () => {
    const api = fakeApi();
    await show(<MyIdeas api={api} />);
    await click("Archive");
    expect(
      screen.getByText(
        "Archive this idea? It leaves the ideas pool and cannot be published again.",
      ),
    ).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]!));
    expect(api.archive).toHaveBeenCalledWith("i1");
  });

  it("shows the empty state", async () => {
    await show(<MyIdeas api={fakeApi({ mine: vi.fn().mockResolvedValue([]) })} />);
    expect(screen.getByText("No ideas yet")).toBeTruthy();
  });
});

describe("IdeaForm (S27)", () => {
  it("keeps the summary and the confidential details apart", async () => {
    await show(<IdeaForm api={fakeApi()} ideaId={null} />);
    expect(
      screen.getByRole("heading", { name: "Summary: every verified member sees this" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Details: only people you approve, after they accept the NDA",
      }),
    ).toBeTruthy();
  });

  it("checks the form, then sends the idea for moderation without a name", async () => {
    const api = fakeApi();
    await show(<IdeaForm api={api} ideaId={null} />);
    await click("Send for review");
    expect(screen.getByRole("alert").textContent).toBe("Add a title of 3 to 120 characters.");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Clinic booking" } });
    fireEvent.change(screen.getByLabelText("The problem it solves"), {
      target: { value: "Patients wait all day at rural clinics without appointments." },
    });
    await click("Industry: Choose");
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "Agriculture" })));
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Prototype" })));
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Partner" })));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Show my name and profile with this idea" }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Full description"), {
      target: {
        value: "An SMS booking service that gives each patient a time slot at the clinic.",
      },
    });
    await click("Send for review");
    expect(api.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ title: "Clinic booking", seeking: "partner", showOwner: false }),
      true,
    );
    expect(router.pushed).toContain("/ideas");
  });

  it("shows the server's reason, such as contact details", async () => {
    const api = fakeApi({
      mine: vi.fn().mockResolvedValue([idea({ status: "draft" })]),
      save: vi.fn().mockResolvedValue({ result: "contact_details", ideaId: null }),
    });
    await show(<IdeaForm api={api} ideaId="i1" />);
    await click("Save draft");
    expect(screen.getByRole("alert").textContent).toBe(
      "Remove phone numbers and email addresses. Members contact each other inside Kingdom Connect.",
    );
  });
});
