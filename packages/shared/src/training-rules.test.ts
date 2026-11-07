import { describe, expect, it } from "vitest";
import {
  checkMaterialLink,
  checkTraining,
  trainingStart,
  videoEmbedUrl,
  type TrainingDraft,
} from "./training-rules";

const now = new Date("2026-11-07T06:00:00Z");

const draft = (over: Partial<TrainingDraft> = {}): TrainingDraft => ({
  title: "Bookkeeping basics",
  provider: "Mwanza Business Centre",
  format: "in_person",
  details: "",
  venue: "Mkuyuni church hall",
  selfPaced: false,
  date: "2026-11-12",
  time: "09:00",
  seats: "30",
  downloadsAllowed: false,
  ...over,
});

describe("checkTraining", () => {
  it("accepts scheduled and self-paced training", () => {
    expect(checkTraining(draft(), now)).toBeNull();
    expect(
      checkTraining(
        draft({ format: "online", venue: "", selfPaced: true, date: "", time: "" }),
        now,
      ),
    ).toBeNull();
  });

  it("names the first problem", () => {
    expect(checkTraining(draft({ title: "AB" }), now)).toBe("title");
    expect(checkTraining(draft({ provider: "X" }), now)).toBe("provider");
    expect(checkTraining(draft({ venue: "" }), now)).toBe("venue");
    expect(checkTraining(draft({ date: "2026-11-07", time: "09:30" }), now)).toBe("start");
    expect(checkTraining(draft({ seats: "0" }), now)).toBe("seats");
    expect(checkTraining(draft({ details: "x".repeat(2001) }), now)).toBe("details");
  });
});

describe("trainingStart", () => {
  it("is empty for self-paced training", () => {
    expect(trainingStart(draft({ selfPaced: true }))).toBeNull();
    expect(trainingStart(draft())?.toISOString()).toBe("2026-11-12T06:00:00.000Z");
  });
});

describe("videoEmbedUrl", () => {
  it("turns YouTube links into a player inside the platform", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=30")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(videoEmbedUrl("https://www.youtube.com/watch?list=x&v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("leaves other links alone", () => {
    expect(videoEmbedUrl("https://vimeo.com/12345")).toBeNull();
    expect(videoEmbedUrl("http://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });
});

describe("checkMaterialLink", () => {
  it("needs a title and an https link", () => {
    expect(checkMaterialLink("Lesson 1", "https://example.test/1")).toBeNull();
    expect(checkMaterialLink("L", "https://example.test/1")).toBe("title");
    expect(checkMaterialLink("Lesson 1", "example.test/1")).toBe("url");
  });
});
