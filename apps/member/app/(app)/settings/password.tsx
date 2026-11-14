import { useEffect, useState } from "react";
import { View } from "react-native";
import { ForgotPasswordForm } from "../../../src/components/login-forms";
import { ScreenTitle } from "../../../src/components/screens";
import { useAuth } from "../../../src/lib/auth";
import { useLanguage } from "../../../src/lib/language";
import { myUsername } from "../../../src/lib/password";
import { loginClient } from "../../../src/lib/supabase";

/**
 * S47 Password and sign-in (REG-6). The same steps as Forgot password, starting from the signed-in
 * member's username: the email code, then the new password. Saving signs out every device, this one
 * too, so the member logs in again with the new password and a new code.
 */
export default function PasswordPage() {
  const { t } = useLanguage();
  const { signOut } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  useEffect(() => {
    void myUsername().then(setUsername);
  }, []);
  return (
    <View className="gap-4">
      <ScreenTitle>{t.changePasswordTitle}</ScreenTitle>
      <View className="rounded-card border border-line bg-surface p-4">
        {username ? (
          <ForgotPasswordForm
            client={loginClient}
            knownUsername={username}
            onLogIn={() => void signOut()}
          />
        ) : null}
      </View>
    </View>
  );
}
