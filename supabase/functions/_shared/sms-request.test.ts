import { describe, expect, it } from "vitest";
import { smsRequest } from "./sms-request.ts";

describe("smsRequest", () => {
  it("keeps the SMS local while no provider key is set", () => {
    expect(smsRequest("+255712345678", "code 123456", {})).toBeNull();
    expect(smsRequest("+255712345678", "code 123456", { apiKey: "k" })).toBeNull();
  });

  it("posts a form to Africa's Talking with the sender ID", () => {
    const request = smsRequest("+255712345678", "Your code is 123456", {
      apiKey: "key",
      username: "kingdomconnect",
      senderId: "KINGDOM",
    })!;
    expect(request.url).toBe("https://api.africastalking.com/version1/messaging");
    expect(request.headers.apiKey).toBe("key");
    const form = new URLSearchParams(request.body);
    expect(form.get("username")).toBe("kingdomconnect");
    expect(form.get("to")).toBe("+255712345678");
    expect(form.get("message")).toBe("Your code is 123456");
    expect(form.get("from")).toBe("KINGDOM");
  });

  it("uses the sandbox for the sandbox username", () => {
    const request = smsRequest("+255712345678", "x", { apiKey: "key", username: "sandbox" })!;
    expect(request.url).toBe("https://api.sandbox.africastalking.com/version1/messaging");
    expect(new URLSearchParams(request.body).has("from")).toBe(false);
  });
});
