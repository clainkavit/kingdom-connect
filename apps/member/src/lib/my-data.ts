import { Platform, Share } from "react-native";
import { profileClient, supabase } from "./supabase";

export type MyDataApi = {
  download: () => Promise<boolean>;
  deleteAll: () => Promise<boolean>;
};

const FILE_NAME = "my-data.json";

async function save(text: string) {
  if (Platform.OS === "web") {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = FILE_NAME;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  await Share.share({ title: FILE_NAME, message: text });
}

export const myDataApi: MyDataApi = {
  async download() {
    const { data, error } = await supabase.rpc("my_data_export");
    if (error || !data) return false;
    await save(JSON.stringify(data, null, 2));
    return true;
  },

  async deleteAll() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;
    return (await profileClient.deleteMyData(token)) === "done";
  },
};
