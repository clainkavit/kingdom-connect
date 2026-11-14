import { USERNAME_PATTERN } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { PendingText } from "../lib/legal";
import { Button, Field, Message, problemText } from "./form";
import { AcceptTexts } from "./legal";
import { LoadingRows } from "./states";

export type FirstResult =
  | "ok"
  | "username_taken"
  | "username_invalid"
  | "email_taken"
  | "texts_missing"
  | "already_done"
  | "not_allowed";

export type FirstSignInApi = {
  suggest: () => Promise<string>;
  email: () => Promise<string>;
  texts: () => Promise<PendingText[]>;
  complete: (username: string, accepted: string[]) => Promise<FirstResult>;
  done: () => Promise<void>;
};

type Loaded = { email: string; texts: PendingText[] };

/** S01a (R26): someone new chooses a username and accepts the terms of use and the privacy notice. */
export function FirstSignIn({ api, entityName }: { api: FirstSignInApi; entityName: string }) {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [username, setUsername] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.email(), api.texts(), api.suggest().catch(() => "")]).then(
      ([email, texts, suggestion]) => {
        if (!live) return;
        setLoaded({ email, texts });
        setUsername(suggestion);
      },
      () => live && setMessage(t.firstFailed),
    );
    return () => {
      live = false;
    };
  }, [api, t.firstFailed]);

  if (!loaded) return message ? <Message text={message} /> : <LoadingRows rows={3} />;

  const accept = async (ids: string[]) => {
    const clean = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(clean)) return setProblem(problemText(t, "username"));
    setProblem(null);
    const result = await api.complete(clean, ids).catch(() => "failed" as const);
    if (result === "ok" || result === "already_done") return api.done();
    if (result === "username_taken") return setProblem(t.usernameTaken);
    if (result === "username_invalid") return setProblem(problemText(t, "username"));
    if (result === "email_taken") return setMessage(t.emailTaken);
    setMessage(t.firstFailed);
  };

  return (
    <View className="gap-4">
      <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">
        {t.firstIntro(loaded.email)}
      </Text>
      <Field label={t.username} value={username} onChange={setUsername} problem={problem} />
      <Message text={message} />
      <AcceptTexts
        texts={loaded.texts}
        entityName={entityName}
        onAccept={accept}
        intro=""
        acceptLabel={t.firstAccept}
      />
    </View>
  );
}

/** S01: Continue with Google, absent until Google sign-in is switched on (#273). */
export function GoogleButton({
  enabled,
  onPress,
  returnedWithError = false,
}: {
  enabled: boolean;
  onPress: () => Promise<boolean>;
  returnedWithError?: boolean;
}) {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(returnedWithError);
  if (!enabled) return null;
  return (
    <View className="gap-3">
      <Button
        secondary
        label={t.googleContinue}
        onPress={async () => setFailed(!(await onPress().catch(() => false)))}
      />
      <Message text={failed ? t.googleFailed : null} />
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-line" />
        <Text className="font-figtree-semibold text-[13px] text-ink-2">{t.orDivider}</Text>
        <View className="h-px flex-1 bg-line" />
      </View>
    </View>
  );
}
