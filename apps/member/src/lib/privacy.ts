import { supabase } from "./supabase";

export type PrivacySwitch = "hidden" | "sharePhone" | "shareEmail" | "shareAddress";

export type PrivacySettings = Record<PrivacySwitch, boolean> & {
  phone: string;
  email: string;
  address: string;
};

export type PrivacyApi = {
  load: () => Promise<PrivacySettings>;
  set: (key: PrivacySwitch, on: boolean) => Promise<boolean>;
};

const stored: Record<PrivacySwitch, { table: "profiles" | "member_private"; column: string }> = {
  hidden: { table: "profiles", column: "hidden_from_directory" },
  sharePhone: { table: "member_private", column: "share_phone" },
  shareEmail: { table: "member_private", column: "share_email" },
  shareAddress: { table: "member_private", column: "share_address" },
};

async function userId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? "";
}

export const privacyApi: PrivacyApi = {
  async load() {
    const id = await userId();
    const [own, profile] = await Promise.all([
      supabase
        .from("member_private")
        .select("phone, email, address, share_phone, share_email, share_address")
        .eq("member_id", id)
        .single(),
      supabase.from("profiles").select("hidden_from_directory").eq("member_id", id).single(),
    ]);
    if (own.error) throw own.error;
    if (profile.error) throw profile.error;
    return {
      hidden: profile.data.hidden_from_directory,
      sharePhone: own.data.share_phone,
      shareEmail: own.data.share_email,
      shareAddress: own.data.share_address,
      phone: own.data.phone ?? "",
      email: own.data.email ?? "",
      address: own.data.address ?? "",
    };
  },

  async set(key, on) {
    const { table, column } = stored[key];
    const { error } = await supabase
      .from(table)
      .update({ [column]: on })
      .eq("member_id", await userId());
    return !error;
  },
};
