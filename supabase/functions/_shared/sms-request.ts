/**
 * The HTTP request that sends one SMS through Africa's Talking (context/memory/sms-provider-tanzania.md),
 * or null when no provider key is set, so the test sender keeps it locally instead.
 */
export type SmsProvider = { apiKey?: string; username?: string; senderId?: string };

export type SmsRequest = { url: string; headers: Record<string, string>; body: string };

export function smsRequest(to: string, message: string, provider: SmsProvider): SmsRequest | null {
  if (!provider.apiKey || !provider.username) return null;
  const form = new URLSearchParams({ username: provider.username, to, message });
  if (provider.senderId) form.set("from", provider.senderId);
  const sandbox = provider.username === "sandbox";
  return {
    url: sandbox
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging",
    headers: {
      apiKey: provider.apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  };
}
