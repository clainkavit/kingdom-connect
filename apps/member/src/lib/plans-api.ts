import * as DocumentPicker from "expo-document-picker";
import { plansApiWith } from "./plans";

export const plansApi = plansApiWith(async () => {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf"],
    copyToCacheDirectory: true,
  });
  const file = picked.canceled ? null : picked.assets[0];
  if (!file) return null;
  return { uri: file.uri, name: file.name, mime: file.mimeType ?? "", size: file.size ?? 0 };
});
