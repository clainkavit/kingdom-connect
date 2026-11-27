import { type Language, photoProblem } from "@kingdom-connect/shared";
import * as ImagePicker from "expo-image-picker";
import type { WizardApi } from "../components/registration-wizard";
import {
  accessToken,
  districtOptions,
  regionOptions,
  saveDraft,
  sectorOptions,
  uploadPhoto,
} from "./registration";
import { registrationClient } from "./supabase";

export function wizardApi(language: Language): WizardApi {
  return {
    saveDraft,
    saveIdentity: async (identity) =>
      registrationClient.saveIdentity(await accessToken(), identity),
    submit: async () => registrationClient.submit(await accessToken()),
    pickAndUploadPhoto: async (kind) => {
      let picked: ImagePicker.ImagePickerResult;
      try {
        picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.7,
        });
      } catch {
        return "unreadable";
      }
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return "cancelled";
      const before = photoProblem({ mimeType: asset.mimeType, size: asset.fileSize });
      if (before) return before;
      let blob: Blob;
      try {
        blob = await (await fetch(asset.uri)).blob();
      } catch {
        return "unreadable";
      }
      return photoProblem({ mimeType: blob.type, size: blob.size }) ?? uploadPhoto(kind, blob);
    },
    regions: () => regionOptions(language),
    districts: (regionId) => districtOptions(regionId, language),
    sectors: () => sectorOptions(language),
  };
}
