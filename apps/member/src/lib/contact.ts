import { profileClient, supabase } from "./supabase";

export type ContactResult =
  | "ok"
  | "invalid_phone"
  | "too_long"
  | "wrong_password"
  | "locked"
  | "invalid_email"
  | "same_email"
  | "email_taken"
  | "too_many_codes"
  | "wrong_code"
  | "expired"
  | "too_many_attempts"
  | "no_code"
  | "failed";

export type ContactApi = {
  setPhone: (phone: string) => Promise<ContactResult>;
  setAddress: (address: string) => Promise<ContactResult>;
  startEmailChange: (password: string, newEmail: string) => Promise<ContactResult>;
  confirmEmailChange: (code: string) => Promise<ContactResult>;
};

async function rpcResult(name: "set_my_phone" | "set_my_address", args: object) {
  const { data, error } = await supabase.rpc(name, args);
  return error ? "failed" : ((data as ContactResult | null) ?? "failed");
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export const contactApi: ContactApi = {
  setPhone: (phone) => rpcResult("set_my_phone", { phone }),
  setAddress: (address) => rpcResult("set_my_address", { address }),
  startEmailChange: async (password, newEmail) =>
    (await profileClient.changeEmail(await accessToken(), {
      step: "start",
      password,
      newEmail,
    })) as ContactResult,
  confirmEmailChange: async (code) =>
    (await profileClient.changeEmail(await accessToken(), {
      step: "confirm",
      code,
    })) as ContactResult,
};
