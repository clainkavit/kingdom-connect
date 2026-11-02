import * as ImagePicker from "expo-image-picker";
import { profileApi } from "./profile";

export const memberProfileApi = profileApi(async () => {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: true,
    aspect: [1, 1],
  });
  return picked.canceled ? null : (picked.assets[0]?.uri ?? null);
});
