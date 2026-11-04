import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { RecoveryForm } from "../src/components/recovery-form";
import { useLanguage } from "../src/lib/language";
import { loginClient } from "../src/lib/supabase";

async function pickPhoto() {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    base64: true,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset?.base64) return null;
  return {
    base64: asset.base64,
    mime: asset.mimeType ?? "image/jpeg",
    size: asset.fileSize ?? Math.ceil((asset.base64.length * 3) / 4),
  };
}

export default function RecoverScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  return (
    <AuthCard title={t.recoveryTitle}>
      <RecoveryForm send={(r) => loginClient.requestEmailRecovery(r)} pickPhoto={pickPhoto} />
      <TextButton label={t.logIn} onPress={() => router.replace("/login")} />
    </AuthCard>
  );
}
