import {
  type LoginClient,
  type RegistrationClient,
  type Session,
  type SignUpInput,
  signUpProblems,
} from "@kingdom-connect/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { Button, Field, Message, problemText } from "./form";

export function SignUpForm({
  registration,
  login,
  onCodeSent,
}: {
  registration: RegistrationClient;
  login: LoginClient;
  onCodeSent: (session: Session, resendAfterSeconds: number) => void;
}) {
  const { t, language } = useLanguage();
  const [input, setInput] = useState<SignUpInput>({
    username: "",
    email: "",
    phone: "",
    password: "",
  });
  const [problems, setProblems] = useState<ReturnType<typeof signUpProblems>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof SignUpInput) => (value: string) =>
    setInput({ ...input, [field]: value });

  const submit = async () => {
    const found = signUpProblems(input);
    setProblems(found);
    setMessage(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    const result = await registration.signUp({ ...input, language });
    if (result.kind === "created") {
      const signedIn = await login.logIn({
        username: input.username.trim(),
        password: input.password,
      });
      setBusy(false);
      if (signedIn.kind === "code_sent")
        return onCodeSent(signedIn.session, signedIn.resendAfterSeconds);
      return setMessage(t.network);
    }
    setBusy(false);
    if (result.kind === "invalid") return setProblems(result.problems);
    if (result.kind === "username_taken") return setMessage(t.usernameTaken);
    if (result.kind === "email_taken") return setMessage(t.emailTaken);
    if (result.kind === "closed") return setMessage(t.registrationClosed);
    if (result.kind === "cap_reached") return setMessage(t.applicationCapReached);
    setMessage(t.network);
  };

  return (
    <View className="gap-3">
      <Text className="font-figtree text-sm leading-5 text-ink-2">{t.signUpIntro}</Text>
      <Field
        label={t.username}
        value={input.username}
        onChange={set("username")}
        hint={t.usernameHint}
        problem={problemText(t, problems.username)}
      />
      <Field
        label={t.email}
        value={input.email}
        onChange={set("email")}
        keyboardType="email-address"
        problem={problemText(t, problems.email)}
      />
      <Field
        label={t.phone}
        value={input.phone}
        onChange={set("phone")}
        keyboardType="phone-pad"
        hint={t.phoneHint}
        problem={problemText(t, problems.phone)}
      />
      <Field
        label={t.password}
        value={input.password}
        onChange={set("password")}
        secure
        hint={t.passwordHint}
        problem={problemText(t, problems.password)}
      />
      <Message text={message} />
      <Button label={t.createAccount} onPress={submit} disabled={busy} />
    </View>
  );
}
