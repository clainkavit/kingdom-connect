import * as DocumentPicker from "expo-document-picker";
import { IDEA_FILE_TYPES, ideaDetailsApi } from "./idea-details";

export const memberIdeaDetailsApi = ideaDetailsApi(async () => {
  const picked = await DocumentPicker.getDocumentAsync({
    type: IDEA_FILE_TYPES,
    copyToCacheDirectory: true,
  });
  const file = picked.canceled ? null : picked.assets[0];
  if (!file) return null;
  return { uri: file.uri, name: file.name, mime: file.mimeType ?? "", size: file.size ?? 0 };
});
