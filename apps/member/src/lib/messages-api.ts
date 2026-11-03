import * as DocumentPicker from "expo-document-picker";
import { FILE_TYPES, messagesApi } from "./messages";

export const memberMessagesApi = messagesApi(async () => {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [...FILE_TYPES],
    copyToCacheDirectory: true,
  });
  const file = picked.canceled ? null : picked.assets[0];
  if (!file) return null;
  return {
    uri: file.uri,
    name: file.name,
    mime: file.mimeType ?? "",
    size: file.size ?? 0,
  };
});
