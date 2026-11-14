import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Platform, useWindowDimensions, View } from "react-native";
import { useLanguage } from "../lib/language";
import { useReducedMotion } from "./motion";
import { usePalette } from "./palette";

/**
 * The logo on maroon, drawn exactly like the splash in public/index.html (same image, same width),
 * so the hand-over from the HTML splash to the app, and on to the intro, shows no jump. Used while
 * the sign-in state loads on every open, and as the first frame of the intro.
 */
export const logoSource =
  Platform.OS === "web"
    ? // The HTML splash preloads this file, so the browser already has it.
      { uri: "/icons/logo-splash.jpg" }
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../../assets/logo-splash.jpg");

/** min(62vw, 260px), the logo width the HTML splash uses. */
export function splashLogoWidth(screenWidth: number): number {
  return Math.min(screenWidth * 0.62, 260);
}

export function SplashLogo({ width }: { width: number }) {
  const { platformName } = useLanguage();
  return (
    <Image
      source={logoSource}
      accessibilityLabel={platformName || undefined}
      role="img"
      style={{ width, height: width * (401 / 440) }}
      resizeMode="contain"
    />
  );
}

export function BootSplash() {
  const { width } = useWindowDimensions();
  return (
    <View
      aria-busy
      className="flex-1 items-center justify-center bg-navy"
      testID="boot-splash"
      style={{ minHeight: "100%" }}
    >
      <SplashLogo width={splashLogoWidth(width)} />
      <LoadingBar />
    </View>
  );
}

/**
 * The thin bar under the logo, the same size, place and movement as in public/index.html.
 * `flush` drops the top margin, for when the caller places it.
 */
export function LoadingBar({ flush }: { flush?: boolean }) {
  const reduced = useReducedMotion();
  const palette = usePalette();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, slide]);
  return (
    <View
      aria-hidden
      className={`h-[3px] w-24 overflow-hidden rounded-full ${flush ? "" : "mt-7"}`}
      style={{ backgroundColor: "rgba(243, 230, 208, 0.18)" }}
    >
      <Animated.View
        style={{
          height: "100%",
          borderRadius: 3,
          backgroundColor: palette.gold,
          width: BAR * 0.4,
          transform: [
            {
              translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-BAR * 0.4, BAR] }),
            },
          ],
        }}
      />
    </View>
  );
}

const BAR = 96;
