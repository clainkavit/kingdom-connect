import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyDataApi } from "../lib/my-data";
import { MyDataScreen } from "./my-data";

afterEach(cleanup);

const fakeApi = (over: Partial<MyDataApi> = {}): MyDataApi => ({
  download: vi.fn().mockResolvedValue(true),
  deleteAll: vi.fn().mockResolvedValue(true),
  ...over,
});

const click = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name })));

describe("MyDataScreen (S49)", () => {
  it("downloads the member's data", async () => {
    const api = fakeApi();
    render(<MyDataScreen api={api} onDeleted={vi.fn()} />);
    await click("Download my data");
    expect(api.download).toHaveBeenCalled();
    expect(screen.getByText("Your data was downloaded.")).toBeTruthy();
  });

  it("shows what is removed and what is kept, and needs the tick before deleting", async () => {
    const api = fakeApi();
    const onDeleted = vi.fn();
    render(<MyDataScreen api={api} onDeleted={onDeleted} />);
    await click("Delete my data");
    expect(screen.getByText(/Your profile, contact details and ID documents/)).toBeTruthy();
    expect(
      screen.getByText(/The audit log keeps a record of your account for 5 years/),
    ).toBeTruthy();
    await click("Delete my data for good");
    expect(screen.getByRole("alert").textContent).toBe("Tick the box to confirm.");
    expect(api.deleteAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "I understand this cannot be undone" }));
    await click("Delete my data for good");
    expect(api.deleteAll).toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalled();
  });

  it("says when deleting failed and keeps the member signed in", async () => {
    const onDeleted = vi.fn();
    render(
      <MyDataScreen
        api={fakeApi({ deleteAll: vi.fn().mockResolvedValue(false) })}
        onDeleted={onDeleted}
      />,
    );
    await click("Delete my data");
    fireEvent.click(screen.getByRole("checkbox", { name: "I understand this cannot be undone" }));
    await click("Delete my data for good");
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't delete your data/);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("can go back without deleting", async () => {
    const api = fakeApi();
    render(<MyDataScreen api={api} onDeleted={vi.fn()} />);
    await click("Delete my data");
    await click("Keep my account");
    expect(screen.getByRole("button", { name: "Download my data" })).toBeTruthy();
  });
});
