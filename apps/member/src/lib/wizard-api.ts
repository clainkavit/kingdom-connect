import type { Language } from "@kingdom-connect/shared";
import * as ImagePicker from "expo-image-picker";
import type { WizardApi } from "../components/registration-wizard";
import {
  accessToken,
  currentTermsAndPrivacy,
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
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
      const uri = picked.canceled ? null : picked.assets[0]?.uri;
      if (!uri) return false;
      await uploadPhoto(kind, uri);
      return true;
    },
    regions: () => regionOptions(language),
    districts: (regionId) => districtOptions(regionId, language),
    sectors: () => sectorOptions(language),
    legalTexts: currentTermsAndPrivacy,
  };
}
