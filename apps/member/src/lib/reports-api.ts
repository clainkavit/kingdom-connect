import * as ImagePicker from "expo-image-picker";
import { reportsApi } from "./reports";

export const memberReportsApi = reportsApi(async () => {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, mime: asset.mimeType ?? "image/jpeg", size: asset.fileSize ?? 0 };
});
