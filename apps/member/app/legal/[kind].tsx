import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { AuthCard, TextButton } from "../../src/components/auth-card";
import { LegalTextView } from "../../src/components/legal";
import { useLanguage } from "../../src/lib/language";
import { legalEntityName } from "../../src/lib/legal";
import { currentTermsAndPrivacy, type LegalText } from "../../src/lib/registration";

/**
 * The terms of use and the privacy notice for visitors, opened from the landing page. Only these two
 * texts are public; the database lets visitors read them and nothing else.
 */
export default function PublicLegalScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const { t, language } = useLanguage();
  const router = useRouter();
  const [text, setText] = useState<LegalText | null | undefined>(undefined);
  const [entityName, setEntityName] = useState("");
  const known = kind === "terms" || kind === "privacy";

  useEffect(() => {
    if (!known) return setText(null);
    let live = true;
    currentTermsAndPrivacy().then(
      (texts) => live && setText(texts.find((x) => x.kind === kind) ?? null),
      () => live && setText(null),
    );
    legalEntityName().then((name) => live && setEntityName(name));
    return () => {
      live = false;
    };
  }, [kind, known]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/welcome"));
  return (
    <AuthCard wide title={kind === "privacy" ? t.legalPrivacy : t.legalTerms}>
      {text === undefined ? (
        <Text className="font-figtree text-sm text-ink-2">{t.loading}</Text>
      ) : text === null ? (
        <Text className="font-figtree text-sm text-ink-2">{t.legalUnavailable}</Text>
      ) : (
        <LegalTextView
          body={language === "sw" ? text.body_sw : text.body_en}
          entityName={entityName}
        />
      )}
      <TextButton label={t.back} onPress={back} />
    </AuthCard>
  );
}
