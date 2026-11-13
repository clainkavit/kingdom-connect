import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { YourSkillsForPost, type MySkillsApi } from "./your-skills";

afterEach(cleanup);

const show = (skills: string[], api: MySkillsApi) =>
  act(async () => {
    render(<YourSkillsForPost skills={skills} api={api} />);
  });

describe("YourSkillsForPost (O12)", () => {
  it("marks the skills the member has and counts them, ignoring case", async () => {
    await show(["bookkeeping", "Excel", "tax returns"], {
      load: vi.fn().mockResolvedValue(["bookkeeping", "excel"]),
      set: vi.fn(),
    });
    expect(screen.getByRole("heading", { name: "Your skills for this job" })).toBeTruthy();
    expect(screen.getByText("You have 2 of 3")).toBeTruthy();
    expect(screen.getAllByText("You have it")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add tax returns to my skills" })).toBeTruthy();
  });

  it("adds a missing skill to the profile and shows it as had", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(["bookkeeping"])
      .mockResolvedValue(["bookkeeping", "tax returns"]);
    const set = vi.fn().mockResolvedValue("done");
    await show(["bookkeeping", "tax returns"], { load, set });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Add tax returns to my skills" })),
    );
    expect(set).toHaveBeenCalledWith(["bookkeeping", "tax returns"]);
    expect(screen.getByText("You have 2 of 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /to my skills/ })).toBeNull();
  });

  it("explains when the profile already has the most skills allowed", async () => {
    await show(["tax returns"], {
      load: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockResolvedValue("too_many"),
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Add tax returns to my skills" })),
    );
    expect(screen.getByText(/You can add up to \d+ skills\./)).toBeTruthy();
  });

  it("says when adding failed", async () => {
    await show(["tax returns"], {
      load: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockRejectedValue(new Error("offline")),
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Add tax returns to my skills" })),
    );
    expect(screen.getByText("That skill was not added. Try again.")).toBeTruthy();
  });
});
