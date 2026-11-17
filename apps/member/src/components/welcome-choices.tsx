import Info from "lucide-react-native/icons/info";
import Mail from "lucide-react-native/icons/mail";
import Smartphone from "lucide-react-native/icons/smartphone";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { Message } from "./form";
import { usePalette } from "./palette";

type Provider = "google" | "facebook" | "apple";

const marks: Record<Provider, string> = { google: "G", facebook: "f", apple: "" };

/**
 * S01 Welcome (Web-Social, Phone-Social): each way in that is switched on for this environment, then email.
 * A way not yet switched on is absent, not disabled (screens.md S01).
 */
export function WelcomeChoices({
  providers,
  phone,
  returnedWithError,
  onProvider,
  onPhone,
  onEmail,
}: {
  providers: Record<Provider, boolean>;
  phone: boolean;
  returnedWithError: boolean;
  onProvider: (provider: Provider) => Promise<boolean>;
  onPhone: () => void;
  onEmail: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const [failed, setFailed] = useState(returnedWithError);
  const labels: Record<Provider, string> = {
    google: t.googleContinue,
    facebook: t.facebookContinue,
    apple: t.appleContinue,
  };
  const choice = (label: string, mark: React.ReactNode, onPress: () => void, dark = false) => (
    <Pressable
      key={label}
      role="button"
      aria-label={label}
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center justify-center gap-3 rounded-full px-5 ${dark ? "bg-ink" : "border border-line-2 bg-surface"}`}
    >
      {mark}
      <Text className={`font-figtree-semibold text-[15px] ${dark ? "text-white" : "text-ink"}`}>
        {label}
      </Text>
    </Pressable>
  );
  const letter = (text: string) => (
    <Text aria-hidden className="w-5 text-center font-figtree-extrabold text-[17px] text-navy">
      {text}
    </Text>
  );
  const shown = (Object.keys(providers) as Provider[]).filter((p) => providers[p]);
  return (
    <View className="gap-3">
      {shown.map((p) =>
        choice(
          labels[p],
          p === "apple" ? null : letter(marks[p]),
          async () => setFailed(!(await onProvider(p).catch(() => false))),
          p === "apple",
        ),
      )}
      {phone
        ? choice(
            t.phoneContinueWith,
            <Smartphone size={18} color={palette.navy} aria-hidden />,
            onPhone,
          )
        : null}
      <Message text={failed ? t.googleFailed : null} />
      {shown.length || phone ? (
        <View className="flex-row items-center gap-3">
          <View className="h-px flex-1 bg-line" />
          <Text className="font-figtree-semibold text-[13px] text-ink-2">{t.orDivider}</Text>
          <View className="h-px flex-1 bg-line" />
        </View>
      ) : null}
      {choice(t.emailContinue, <Mail size={18} color={palette.navy} aria-hidden />, onEmail)}
      <View className="flex-row items-start gap-2.5 rounded-[16px] border border-line bg-surface px-4 py-3">
        <Info size={14} color={palette.ink2} aria-hidden />
        <Text className="flex-1 font-figtree text-[13px] leading-5 text-ink-2">
          {t.welcomeNote}
        </Text>
      </View>
    </View>
  );
}
