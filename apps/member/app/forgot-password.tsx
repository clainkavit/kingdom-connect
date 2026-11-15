import { useRouter } from "expo-router";
import KeyRound from "lucide-react-native/icons/key-round";
import { AuthCard, TextButton } from "../src/components/auth-card";
import { ForgotPasswordForm } from "../src/components/login-forms";
import { useLanguage } from "../src/lib/language";
import { loginClient } from "../src/lib/supabase";

export default function ForgotPasswordScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const logIn = () => router.replace("/login");
  return (
    <AuthCard
      title={t.forgotTitle}
      back={{ label: t.backToLogIn, onPress: logIn }}
      icon={<KeyRound size={26} color="#ffffff" aria-hidden />}
      footer={<TextButton label={t.backToLogIn} onPress={logIn} />}
    >
      <ForgotPasswordForm client={loginClient} onLogIn={logIn} />
    </AuthCard>
  );
}
