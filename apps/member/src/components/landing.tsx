import { languages, motion } from "@kingdom-connect/shared";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import photo from "../../assets/landing-photo.jpg";
import { useLanguage } from "../lib/language";
import { logoSource } from "./boot-splash";
import { PressScale, useReducedMotion } from "./motion";
import { usePalette } from "./palette";

const native = Platform.OS !== "web";

/** Computer layout from 1024 px: text on the left, the photo card on the right (Web-Landing). */
export const WIDE = 1024;

/**
 * S01 Landing (PRD section 5, screen 1), from the Web-Landing and Phone-Landing designs: what the
 * platform is, Create an account, Log in and the language switch. `play` starts the entrance; the
 * landing page waits for it while the first-open intro covers it.
 */
export function LandingScreen({
  play,
  hidden,
  onSignUp,
  onLogIn,
  onLegal,
}: {
  play: boolean;
  hidden?: boolean;
  onSignUp: () => void;
  onLogIn: () => void;
  onLegal: (kind: "terms" | "privacy") => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const enter = useEntrance(play, 5);

  const copy = (
    <View className="gap-4">
      <Animated.View style={enter(0)}>
        {wide ? (
          <Text className="font-figtree-bold text-xs uppercase tracking-[1.5px] text-blue">
            <Eyebrow />
          </Text>
        ) : (
          <Text className="font-display text-xl text-blue">
            <Eyebrow />
          </Text>
        )}
      </Animated.View>
      <Animated.View style={enter(1)}>
        <Title wide={wide} />
      </Animated.View>
      <Animated.View style={enter(2)}>
        <Body />
      </Animated.View>
      <Animated.View style={enter(3)}>
        <Actions wide={wide} onSignUp={onSignUp} onLogIn={onLogIn} />
      </Animated.View>
    </View>
  );

  if (wide)
    return (
      <View
        aria-hidden={hidden || undefined}
        className="flex-1 flex-row gap-6 bg-bg p-6"
        role="main"
      >
        <View className="w-[420px] justify-between py-2 pl-4 pr-2">
          <View className="flex-row items-center justify-between">
            <LogoTile size={96} />
            <LanguagePill />
          </View>
          {copy}
          <Animated.View style={enter(4)}>
            <LegalLinks onLegal={onLegal} />
          </Animated.View>
        </View>
        <Photo className="flex-1 overflow-hidden rounded-[20px]">
          <View className="flex-1 justify-between p-12">
            <View className="max-w-[360px] self-end rounded-2xl bg-navy px-6 py-4">
              <Text className="text-right font-display text-[28px] leading-8 text-navy-ink">
                <Eyebrow />
              </Text>
            </View>
            <VerifiedChip className="self-end" />
          </View>
        </Photo>
      </View>
    );

  const tablet = width >= 640;
  return (
    <ScrollView
      aria-hidden={hidden || undefined}
      className="flex-1 bg-bg"
      contentContainerClassName="flex-grow"
    >
      <Photo style={{ height: tablet ? 460 : Math.min(470, width * 1.15) }}>
        <View className="flex-1 justify-between p-5">
          <View className="flex-row items-center justify-between">
            <LogoTile size={64} />
            <LanguagePill onPhoto />
          </View>
          <VerifiedChip className="self-start" />
        </View>
      </Photo>
      <View
        role="main"
        className={`w-full gap-6 px-6 pb-8 pt-7 ${tablet ? "max-w-[560px] self-center" : ""}`}
      >
        {copy}
        <Animated.View style={enter(4)}>
          <LegalLinks onLegal={onLegal} />
        </Animated.View>
      </View>
    </ScrollView>
  );
}

/** Each of `count` items rises in one after another once `play` is true. */
function useEntrance(play: boolean, count: number) {
  const reduced = useReducedMotion();
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  useEffect(() => {
    if (!play) return;
    if (reduced) {
      values.forEach((v) => v.setValue(1));
      return;
    }
    const run = Animated.stagger(
      motion.stagger,
      values.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: motion.enter + 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: native,
        }),
      ),
    );
    run.start();
    return () => run.stop();
  }, [play, reduced, values]);
  return (i: number) => ({
    opacity: values[i],
    transform: [
      { translateY: values[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
    ],
  });
}

export function Eyebrow() {
  const { t } = useLanguage();
  return <>{t.landingEyebrow}</>;
}

function Title({ wide }: { wide: boolean }) {
  const { t } = useLanguage();
  return (
    <Text
      role="heading"
      aria-level={1}
      className={`font-display text-navy ${wide ? "text-[52px] leading-[54px]" : "text-[36px] leading-[40px]"}`}
    >
      {t.landingTitle}
    </Text>
  );
}

function Body() {
  const { t } = useLanguage();
  return <Text className="font-figtree text-[15px] leading-6 text-ink-2">{t.landingBody}</Text>;
}

function Actions({
  wide,
  onSignUp,
  onLogIn,
}: {
  wide: boolean;
  onSignUp: () => void;
  onLogIn: () => void;
}) {
  const { t } = useLanguage();
  return (
    <View className={`mt-2 gap-3 ${wide ? "flex-row" : ""}`}>
      <PressScale
        role="button"
        aria-label={t.createAccount}
        onPress={onSignUp}
        className={`min-h-[56px] items-center justify-center rounded-full bg-navy px-8 active:opacity-90`}
      >
        <Text className="font-figtree-bold text-base text-white">{t.createAccount}</Text>
      </PressScale>
      <PressScale
        role="button"
        aria-label={t.logIn}
        onPress={onLogIn}
        className={`min-h-[56px] items-center justify-center rounded-full border border-navy px-8 active:opacity-90 ${wide ? "min-w-[164px]" : ""}`}
      >
        <Text className="font-figtree-semibold text-base text-navy">{t.logIn}</Text>
      </PressScale>
    </View>
  );
}

export function Photo({
  className,
  style,
  children,
}: {
  className?: string;
  style?: object;
  children: React.ReactNode;
}) {
  return (
    <ImageBackground
      source={photo}
      resizeMode="cover"
      imageStyle={{ width: "100%", height: "100%" }}
      accessibilityIgnoresInvertColors
      className={`bg-navy ${className ?? ""}`}
      style={style}
    >
      {children}
    </ImageBackground>
  );
}

export function LogoTile({ size }: { size: number }) {
  const { platformName } = useLanguage();
  return (
    <Image
      source={logoSource}
      accessibilityLabel={platformName || undefined}
      role="img"
      resizeMode="cover"
      className="rounded-2xl bg-navy"
      style={{ width: size, height: size * 0.92 }}
    />
  );
}

export function VerifiedChip({ className }: { className?: string }) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View
      className={`flex-row items-center gap-2 rounded-full bg-surface px-4 py-2 ${className ?? ""}`}
    >
      <ShieldCheck size={16} color={palette.navy} aria-hidden />
      <Text className="font-figtree-semibold text-[13px] text-navy">{t.everyMemberVerified}</Text>
    </View>
  );
}

/** EN and SW as a pill, as in the designs. */
export function LanguagePill({ onPhoto }: { onPhoto?: boolean }) {
  const { language, t, setLanguage } = useLanguage();
  return (
    <View
      role="group"
      aria-label={t.language}
      className={`flex-row rounded-full border p-1 ${onPhoto ? "border-transparent bg-surface" : "border-line bg-surface"}`}
    >
      {languages.map((option) => {
        const on = option.code === language;
        return (
          <Pressable
            key={option.code}
            role="button"
            aria-label={option.name}
            aria-pressed={on}
            onPress={() => setLanguage(option.code)}
            className={`min-h-[44px] min-w-[48px] items-center justify-center rounded-full px-3 ${on ? "bg-navy" : ""}`}
          >
            <Text className={`font-figtree-bold text-sm ${on ? "text-white" : "text-ink-2"}`}>
              {option.code.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LegalLinks({ onLegal }: { onLegal: (kind: "terms" | "privacy") => void }) {
  const { t } = useLanguage();
  return (
    <View className="flex-row flex-wrap justify-end gap-4">
      {(["terms", "privacy"] as const).map((kind) => {
        const label = kind === "terms" ? t.legalTerms : t.legalPrivacy;
        return (
          <Pressable
            key={kind}
            role="link"
            aria-label={label}
            onPress={() => onLegal(kind)}
            className="min-h-[44px] justify-center"
          >
            <Text className="font-figtree text-[13px] text-ink-2 underline">{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
