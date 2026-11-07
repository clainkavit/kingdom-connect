import "../test-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Linking } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Material, MaterialsApi } from "../lib/materials";
import { Materials } from "./materials";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const pdf: Material = {
  id: "m1",
  kind: "file",
  title: "Workbook",
  storagePath: "t1/f1.pdf",
  size: 5000,
  url: null,
};
const video: Material = {
  id: "m2",
  kind: "link",
  title: "Lesson 1",
  storagePath: null,
  size: null,
  url: "https://youtu.be/dQw4w9WgXcQ",
};
const slides: Material = {
  id: "m3",
  kind: "link",
  title: "Slides",
  storagePath: null,
  size: null,
  url: "https://slides.example.test/deck",
};

const fakeApi = (over: Partial<MaterialsApi> = {}): MaterialsApi => ({
  list: vi.fn().mockResolvedValue([pdf, video, slides]),
  canManage: vi.fn().mockResolvedValue(false),
  fileUrl: vi.fn().mockResolvedValue("https://files.example.test/signed"),
  pickPdf: vi.fn().mockResolvedValue(null),
  addFile: vi.fn().mockResolvedValue("ok"),
  addLink: vi.fn().mockResolvedValue("ok"),
  remove: vi.fn().mockResolvedValue("ok"),
  ...over,
});

async function show(
  api: MaterialsApi,
  props: { canOpen?: boolean; downloadsAllowed?: boolean } = {},
) {
  await act(async () => {
    render(
      <Materials
        api={api}
        trainingId="t1"
        canOpen={props.canOpen ?? true}
        downloadsAllowed={props.downloadsAllowed ?? false}
      />,
    );
  });
}

const buttons = (name: string) => screen.getAllByRole("button", { name });

describe("Materials (S36)", () => {
  it("is locked until the member registers, without asking the server", async () => {
    const api = fakeApi();
    await show(api, { canOpen: false });
    expect(screen.getByText("Register to open the learning materials.")).toBeTruthy();
    expect(api.list).not.toHaveBeenCalled();
  });

  it("opens a PDF inside the platform, with no download when downloads are off", async () => {
    const api = fakeApi();
    await show(api);
    expect(
      screen.getByText("Downloads are off for this training. Open materials here instead."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    await act(async () => fireEvent.click(buttons("Open")[0]!));
    expect(api.fileUrl).toHaveBeenCalledWith("t1/f1.pdf", false);
    expect(screen.getByTitle("Workbook").getAttribute("src")).toBe(
      "https://files.example.test/signed#toolbar=0",
    );
  });

  it("offers Download when the poster allowed it", async () => {
    const open = vi.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const api = fakeApi();
    await show(api, { downloadsAllowed: true });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Download" })));
    expect(api.fileUrl).toHaveBeenCalledWith("t1/f1.pdf", true);
    expect(open).toHaveBeenCalledWith("https://files.example.test/signed");
  });

  it("plays a YouTube video inside the platform and opens other links", async () => {
    const open = vi.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await show(fakeApi());
    expect(screen.getByText("Video")).toBeTruthy();
    await act(async () => fireEvent.click(buttons("Open")[1]!));
    expect(screen.getByTitle("Lesson 1").getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Open the link" })));
    expect(open).toHaveBeenCalledWith("https://slides.example.test/deck");
  });

  it("lets the poster add a link, refuse a non-PDF, and remove materials", async () => {
    const api = fakeApi({
      canManage: vi.fn().mockResolvedValue(true),
      pickPdf: vi
        .fn()
        .mockResolvedValue({ uri: "x", name: "a.docx", mime: "application/msword", size: 10 }),
    });
    await show(api);
    fireEvent.change(screen.getByLabelText("Material title"), { target: { value: "Lesson 2" } });
    fireEvent.change(screen.getByLabelText("Link (video or slides)"), {
      target: { value: "https://youtu.be/abcdefghijk" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add the link" })));
    expect(api.addLink).toHaveBeenCalledWith("t1", "Lesson 2", "https://youtu.be/abcdefghijk");

    fireEvent.change(screen.getByLabelText("Material title"), { target: { value: "Notes" } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Choose a PDF to add" })),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Choose a PDF of up to 20 MB. Share slides as a PDF or a link.",
    );
    expect(api.addFile).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(buttons("Remove")[0]!));
    expect(api.remove).toHaveBeenCalledWith(pdf);
  });
});
