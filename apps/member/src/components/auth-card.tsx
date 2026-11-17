import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import hands from "../../assets/brand/joined-hands.jpg";
import logo from "../../assets/brand/logo.jpg";
import { useLanguage } from "../lib/language";
import { LanguageSwitch } from "./language-switch";
import { LinkButton } from "./link-button";
import { usePalette } from "./palette";
import { usePhone } from "./sheet";

/**
 * The sign-in screens, as on the canvas boards (Web-Login, Web-Social): on a computer a column with the logo,
 * the language toggle, a serif title and the form, beside a maroon photo panel; on a phone the column alone.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  wide,
  back,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  back?: { label: string; onPress: () => void };
  icon?: React.ReactNode;
}) {
  const { t, platformName } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();
  const column = (
    <View className={`flex-1 justify-between gap-8 ${phone ? "px-5 py-5" : "w-[380px] py-4"}`}>
      <View className="flex-row items-center justify-between gap-3">
        <Image
          source={logo}
          accessibilityLabel={platformName}
          resizeMode="cover"
          style={{ width: 44, height: 40, borderRadius: 10 }}
        />
        <LanguageSwitch pill />
      </View>
      <View role="main" className="gap-4">
        {back ? (
          <Pressable
            role="button"
            aria-label={back.label}
            onPress={back.onPress}
            className="min-h-[36px] flex-row items-center gap-1.5 self-start"
          >
            <ChevronLeft size={16} color={palette.navy} aria-hidden />
            <Text className="font-figtree-semibold text-[15px] text-navy underline">
              {back.label}
            </Text>
          </Pressable>
        ) : null}
        <View className="items-center gap-2">
          {icon ? (
            <View className="mb-2 h-16 w-16 items-center justify-center rounded-[18px] bg-navy">
              {icon}
            </View>
          ) : null}
          <Text
            role="heading"
            aria-level={1}
            className={`text-center font-serif text-navy ${phone ? "text-[34px] leading-[38px]" : "text-[44px] leading-[48px]"}`}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-center font-figtree text-[15px] leading-[22px] text-ink-2">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {children}
      </View>
      <View className="gap-2">
        {footer ?? null}
        <LegalLinks end={!phone} />
      </View>
    </View>
  );
  if (phone)
    return (
      <ScrollView className="flex-1 bg-bg" contentContainerClassName="flex-grow">
        {column}
      </ScrollView>
    );
  return (
    <View className="flex-1 flex-row gap-12 bg-bg p-6">
      <ScrollView
        className={wide ? "max-w-[720px] flex-1" : "flex-none"}
        contentContainerClassName="flex-grow px-4"
      >
        {wide ? <View className="w-full max-w-[680px] self-center">{column}</View> : column}
      </ScrollView>
      <View className="flex-1 overflow-hidden rounded-[28px] bg-navy">
        <Image
          source={hands}
          accessibilityLabel={t.authPhotoAlt}
          resizeMode="cover"
          style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.55 }}
        />
        <View className="flex-1 justify-between p-12">
          <Text className="self-end text-right font-serif text-[30px] leading-[34px] text-navy-ink">
            {t.authTagline}
          </Text>
          <View className="flex-row items-center gap-1.5 self-end rounded-full bg-surface px-4 py-2">
            <ShieldCheck size={14} color={palette.navy} aria-hidden />
            <Text className="font-figtree-bold text-[13px] text-navy">{t.authEveryVerified}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Terms of use and Privacy notice, open to visitors (Web-Terms, Web-Privacy). */
export function LegalLinks({ end }: { end?: boolean }) {
  const { t } = useLanguage();
  return (
    <View className={`flex-row flex-wrap gap-4 ${end ? "self-end" : "self-start"}`}>
      {(
        [
          ["/terms", t.legalTerms],
          ["/privacy", t.legalPrivacy],
        ] as const
      ).map(([href, label]) => (
        <LinkButton key={href} href={href} label={label} className="min-h-[36px] justify-center">
          <Text className="font-figtree text-[13px] text-ink-2 underline">{label}</Text>
        </LinkButton>
      ))}
    </View>
  );
}

export function TextButton({
  label,
  onPress,
  end,
}: {
  label: string;
  onPress: () => void;
  end?: boolean;
}) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      className={`min-h-[44px] justify-center ${end ? "self-end" : "self-start"}`}
    >
      <Text className="font-figtree-semibold text-sm text-navy underline">{label}</Text>
    </Pressable>
  );
}
