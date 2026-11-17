import { formatDate, isDraftVersion, type LegalKind } from "@kingdom-connect/shared";
import { useRouter } from "expo-router";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import logo from "../../assets/brand/logo.jpg";
import { useLanguage } from "../lib/language";
import type { PublicLegalText } from "../lib/legal";
import { useLoad } from "./events";
import { Button } from "./form";
import { legalTitleKeys, LegalTextView } from "./legal";
import { usePalette } from "./palette";
import { usePhone } from "./sheet";
import { ErrorState, LoadingRows } from "./states";

type Reader = (kind: LegalKind) => Promise<{ text: PublicLegalText | null; entityName: string }>;

/** Strips the text's own top heading: the page shows the title above the card. */
const withoutTitle = (body: string) => body.replace(/^\s*#\s[^\n]*\n+/, "");

/** Web-Terms, Web-Privacy and their phone boards: the text in effect, open to visitors. */
export function LegalPage({ kind, read }: { kind: LegalKind; read: Reader }) {
  const { t, language, platformName } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState<"en" | "sw" | null>(null);
  const loaded = useLoad(() => read(kind), attempt);
  const lang = shown ?? language;
  const title = t[legalTitleKeys[kind]] as string;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/welcome"));

  const toggle = (
    <View role="radiogroup" aria-label={t.legalLanguage} className="flex-row gap-1.5">
      {(["en", "sw"] as const).map((code) => (
        <Pressable
          key={code}
          role="radio"
          aria-checked={lang === code}
          aria-label={code === "en" ? t.legalEnglish : t.legalKiswahili}
          onPress={() => setShown(code)}
          className={`min-h-[36px] justify-center rounded-full px-3.5 ${lang === code ? "bg-navy" : "border border-line-2 bg-surface"}`}
        >
          <Text
            className={`font-figtree-semibold text-[13px] ${lang === code ? "text-white" : "text-navy"}`}
          >
            {code === "en" ? t.legalEnglish : t.legalKiswahili}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const body =
    loaded.state === "failed" ? (
      <ErrorState message={t.legalLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
    ) : loaded.state === "loading" ? (
      <LoadingRows />
    ) : !loaded.value.text ? (
      <ErrorState message={t.legalLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
    ) : (
      <View className="gap-4">
        <Text
          className={`self-start rounded-full px-3 py-1 font-figtree-bold text-[12px] ${isDraftVersion(loaded.value.text.version, loaded.value.text.approved_at) ? "bg-warn-soft text-warn-text" : "bg-good-soft text-good-text"}`}
        >
          {(isDraftVersion(loaded.value.text.version, loaded.value.text.approved_at)
            ? t.legalDraftChip
            : t.legalVersionChip)(
            loaded.value.text.version,
            formatDate(new Date(loaded.value.text.effective_at), language),
          )}
        </Text>
        <View
          className={phone ? "gap-2" : "gap-2 rounded-card border border-line bg-surface px-8 py-7"}
        >
          <LegalTextView
            body={withoutTitle(
              lang === "sw" ? loaded.value.text.body_sw : loaded.value.text.body_en,
            )}
            entityName={loaded.value.entityName || platformName}
            large
          />
        </View>
      </View>
    );

  return (
    <View className="flex-1 bg-bg">
      <ScrollView className="flex-1" contentContainerClassName={phone ? "px-5 py-5" : "px-8 py-6"}>
        <View className="flex-row items-center justify-between gap-3">
          {phone ? (
            <Pressable
              role="button"
              aria-label={t.back}
              onPress={back}
              className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface"
            >
              <ChevronLeft size={20} color={palette.navy} aria-hidden />
            </Pressable>
          ) : (
            <Image
              source={logo}
              accessibilityLabel={platformName}
              resizeMode="cover"
              style={{ width: 44, height: 40, borderRadius: 10 }}
            />
          )}
          {toggle}
        </View>
        <View role="main" className="w-full max-w-[760px] gap-4 self-center pt-6">
          {phone ? null : (
            <Pressable
              role="button"
              aria-label={t.back}
              onPress={back}
              className="min-h-[36px] flex-row items-center gap-1.5 self-start"
            >
              <ChevronLeft size={16} color={palette.navy} aria-hidden />
              <Text className="font-figtree-semibold text-[15px] text-navy underline">
                {t.back}
              </Text>
            </Pressable>
          )}
          <Text
            role="heading"
            aria-level={1}
            className={`font-serif text-navy ${phone ? "text-[34px] leading-[38px]" : "text-[48px] leading-[52px]"}`}
          >
            {title}
          </Text>
          {body}
        </View>
      </ScrollView>
      {phone ? (
        <View className="border-t border-line bg-bg px-5 py-3">
          <Button label={t.back} onPress={back} />
        </View>
      ) : null}
    </View>
  );
}
