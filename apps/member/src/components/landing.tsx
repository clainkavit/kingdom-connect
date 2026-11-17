import ShieldCheck from "lucide-react-native/icons/shield-check";
import { Image, ScrollView, Text, View } from "react-native";
import hands from "../../assets/brand/joined-hands.jpg";
import logo from "../../assets/brand/logo.jpg";
import { useLanguage } from "../lib/language";
import { LegalLinks } from "./auth-card";
import { LanguageSwitch } from "./language-switch";
import { LinkButton } from "./link-button";
import { usePalette } from "./palette";
import { usePhone } from "./sheet";

/** S00 Landing (Web-Landing, Phone-Landing): what Kingdom Connect is, then Create an account or Log in. */
export function Landing() {
  const { t, platformName } = useLanguage();
  const palette = usePalette();
  const phone = usePhone();

  const actions = (
    <View className={phone ? "gap-3" : "flex-row flex-wrap gap-3"}>
      <LinkButton
        href="/sign-up"
        label={t.createAccount}
        className="min-h-[56px] items-center justify-center rounded-full bg-navy px-8"
      >
        <Text className="font-figtree-bold text-[16px] text-white">{t.createAccount}</Text>
      </LinkButton>
      <LinkButton
        href="/login"
        label={t.logIn}
        className="min-h-[56px] items-center justify-center rounded-full border border-navy bg-surface px-14"
      >
        <Text className="font-figtree-semibold text-[16px] text-navy">{t.logIn}</Text>
      </LinkButton>
    </View>
  );
  const verified = (
    <View className="flex-row items-center gap-1.5 self-start rounded-full bg-surface px-4 py-2">
      <ShieldCheck size={14} color={palette.navy} aria-hidden />
      <Text className="font-figtree-bold text-[13px] text-navy">{t.authEveryVerified}</Text>
    </View>
  );
  const photo = (
    <Image
      source={hands}
      accessibilityLabel={t.authPhotoAlt}
      resizeMode="cover"
      style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.55 }}
    />
  );
  const mark = (
    <Image
      source={logo}
      accessibilityLabel={platformName}
      resizeMode="cover"
      style={{ width: 44, height: 40, borderRadius: 10 }}
    />
  );

  if (phone)
    return (
      <ScrollView className="flex-1 bg-bg" contentContainerClassName="flex-grow">
        <View className="h-[440px] overflow-hidden bg-navy">
          {photo}
          <View className="flex-1 justify-between px-5 pb-6 pt-5">
            <View className="flex-row items-center justify-between">
              {mark}
              <LanguageSwitch pill />
            </View>
            {verified}
          </View>
        </View>
        <View role="main" className="flex-1 gap-4 px-6 pb-8 pt-8">
          <Text className="font-serif text-[20px] text-navy">{t.authTagline}</Text>
          <Text
            role="heading"
            aria-level={1}
            className="font-serif text-[34px] leading-[38px] text-navy"
          >
            {t.landingTitle}
          </Text>
          <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">
            {t.landingBody}
          </Text>
          <View className="pt-2">{actions}</View>
          <View className="flex-1" />
          <LegalLinks />
        </View>
      </ScrollView>
    );

  return (
    <View className="flex-1 flex-row gap-12 bg-bg p-6">
      <ScrollView className="flex-none" contentContainerClassName="flex-grow px-4">
        <View className="w-[380px] flex-1 justify-between gap-8 py-4">
          <View className="flex-row items-center justify-between gap-3">
            {mark}
            <LanguageSwitch pill />
          </View>
          <View role="main" className="gap-5">
            <Text className="font-figtree-bold text-[13px] tracking-[0.08em] text-navy">
              {t.authTagline.toUpperCase()}
            </Text>
            <Text
              role="heading"
              aria-level={1}
              className="font-serif text-[52px] leading-[56px] text-navy"
            >
              {t.landingTitle}
            </Text>
            <Text className="font-figtree text-[16px] leading-6 text-ink-2">{t.landingBody}</Text>
            <View className="pt-3">{actions}</View>
          </View>
          <LegalLinks end />
        </View>
      </ScrollView>
      <View className="flex-1 overflow-hidden rounded-[28px] bg-navy">
        {photo}
        <View className="flex-1 justify-between p-12">
          <Text className="self-end text-right font-serif text-[30px] leading-[34px] text-navy-ink">
            {t.authTagline}
          </Text>
          <View className="self-end">{verified}</View>
        </View>
      </View>
    </View>
  );
}
