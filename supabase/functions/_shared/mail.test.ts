import { describe, expect, it } from "vitest";
import { mailRequest } from "./mail-request.ts";

const email = { subject: "Your code", text: "123456" };
const sender = { email: "noreply@example.test", name: "Kingdom Connect" };

describe("mailRequest (F08)", () => {
  it("builds a Brevo transactional request when a key is set", () => {
    const request = mailRequest("member@example.test", email, sender, {
      brevoKey: "key-for-test",
      catcherUrl: "http://inbucket:8025/api/v1/send",
    });
    expect(request.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(request.headers["api-key"]).toBe("key-for-test");
    expect(JSON.parse(request.body)).toEqual({
      sender: { email: "noreply@example.test", name: "Kingdom Connect" },
      to: [{ email: "member@example.test" }],
      subject: "Your code",
      textContent: "123456",
    });
  });

  it("uses the local mail catcher when there is no key", () => {
    const request = mailRequest("member@example.test", email, sender, {
      catcherUrl: "http://inbucket:8025/api/v1/send",
    });
    expect(request.url).toBe("http://inbucket:8025/api/v1/send");
    expect(request.headers["api-key"]).toBeUndefined();
    expect(JSON.parse(request.body)).toMatchObject({
      From: { Email: "noreply@example.test" },
      To: [{ Email: "member@example.test" }],
      Subject: "Your code",
      Text: "123456",
    });
  });

  it("refuses to send when neither service is set", () => {
    expect(() => mailRequest("member@example.test", email, sender, {})).toThrow(/no email service/);
  });

  it("never puts the key in the body", () => {
    const request = mailRequest("member@example.test", email, sender, { brevoKey: "key-for-test" });
    expect(request.body).not.toContain("key-for-test");
  });
});
