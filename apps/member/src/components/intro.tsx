import AsyncStorage from "@react-native-async-storage/async-storage";
import { motion } from "@kingdom-connect/shared";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useLanguage } from "../lib/language";
import { LoadingBar, SplashLogo, splashLogoWidth } from "./boot-splash";
import { useReducedMotion } from "./motion";

/** Remembered on the device once the intro has played or been skipped. */
export const INTRO_SEEN_KEY = "kc.intro.seen.v1";

const native = Platform.OS !== "web";
const { settle, word, hold, lift } = motion.intro;
const WORDS_START = settle;
const LIFT_START = WORDS_START + 3 * word + hold;
const END = Math.min(LIFT_START + lift, motion.intro.total);

type IntroState = "checking" | "play" | "skip";

/**
 * On the web, a visitor who already waited this long for the app on a slow connection (the
 * logo splash was showing) goes straight to the landing page; the intro waits for a later,
 * faster open, when the app comes from the cache.
 */
export const SLOW_START_MS = 3000;

function startedSlowly(): boolean {
  if (Platform.OS !== "web" || typeof performance === "undefined") return false;
  // Only a real page load counts (a test environment has no navigation entry).
  const loads = performance.getEntriesByType?.("navigation") ?? [];
  return loads.length > 0 && performance.now() > SLOW_START_MS;
}

/**
 * Whether this device should see the intro: only the first time the landing page opens, and not
 * after a slow first load. `markSeen` remembers it only once the intro has actually played.
 */
export function useIntroState(): [IntroState, () => void] {
  const [state, setState] = useState<IntroState>("checking");
  const played = useRef(false);
  useEffect(() => {
    let live = true;
    const slow = startedSlowly();
    AsyncStorage.getItem(INTRO_SEEN_KEY).then(
      (seen) => {
        if (!live) return;
        played.current = !seen && !slow;
        setState(played.current ? "play" : "skip");
      },
      () => live && setState("skip"),
    );
    return () => {
      live = false;
    };
  }, []);
  const markSeen = () => {
    if (!played.current) return;
    void AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => undefined);
  };
  return [state, markSeen];
}

/**
 * The first-open intro (Phase 3). It starts as an exact copy of the HTML splash, so the hand-over
 * shows no jump: the logo settles, "People · Opportunities · Growth" comes in word by word, then the
 * maroon panel lifts away to show the landing page, which has been loading underneath all along.
 * Under 2.5 s. A tap anywhere, or the Skip button, ends it at once. With reduce motion on, the
 * tagline shows without movement and the panel simply fades.
 *
 * `onLift` fires when the landing page starts to show, `onDone` when the intro is gone.
 */
export function Intro({
  state,
  onLift,
  onDone,
}: {
  state: IntroState;
  onLift: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const clock = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);
  const lifted = useRef(false);
  const run = useRef<Animated.CompositeAnimation | null>(null);

  const startLift = () => {
    if (lifted.current) return;
    lifted.current = true;
    onLift();
  };
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    startLift();
    onDone();
  };

  /** Ends the intro now: a short fade, whatever point it had reached. */
  const skip = () => {
    if (finished.current) return;
    run.current?.stop();
    startLift();
    Animated.timing(fade, {
      toValue: 0,
      duration: motion.exit,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: native,
    }).start(finish);
  };

  useEffect(() => {
    if (state === "checking") return;
    if (state === "skip") {
      // A returning visitor: the logo was already on screen, so it just fades.
      skip();
      return;
    }
    if (reduced) {
      clock.setValue(LIFT_START);
      const timer = setTimeout(skip, 900);
      return () => clearTimeout(timer);
    }
    const id = clock.addListener(({ value }) => {
      if (value >= LIFT_START) startLift();
    });
    run.current = Animated.timing(clock, {
      toValue: END,
      duration: END,
      easing: Easing.linear,
      useNativeDriver: native,
    });
    run.current.start(({ finished: done }) => done && finish());
    return () => {
      clock.removeListener(id);
      run.current?.stop();
    };
    // The intro runs once; its callbacks are stable for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, reduced]);

  const between = (from: number, to: number, outputRange: number[]) =>
    clock.interpolate({ inputRange: [from, to], outputRange, extrapolate: "clamp" });

  // The logo and tagline go first, then the maroon dissolves, so nothing ghosts over the page.
  const contentOpacity = between(LIFT_START, LIFT_START + 220, [1, 0]);
  const panelOpacity = Animated.multiply(between(LIFT_START + 100, END, [1, 0]), fade);
  const panelShift = between(LIFT_START, END, [0, -36]);
  const logoScale = clock.interpolate({
    inputRange: [0, settle / 2, settle, LIFT_START, END],
    outputRange: [1, 1.035, 1, 1, 0.94],
    extrapolate: "clamp",
  });
  const barOpacity = between(0, 200, [1, 0]);
  const words = t.landingEyebrow.split(" · ");

  return (
    <Animated.View
      testID="intro"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        opacity: panelOpacity,
        transform: [{ translateY: panelShift }],
      }}
    >
      <Pressable
        onPress={skip}
        aria-hidden
        focusable={false}
        className="flex-1 items-center justify-center bg-navy"
      >
        <Animated.View style={{ opacity: contentOpacity, transform: [{ scale: logoScale }] }}>
          <SplashLogo width={splashLogoWidth(width)} />
        </Animated.View>
        {/* Same height as the splash's bar, so the logo does not move at the hand-over. */}
        <Animated.View
          style={{
            marginTop: 28,
            height: 3,
            width: "100%",
            alignItems: "center",
            opacity: contentOpacity,
          }}
        >
          <Animated.View style={{ opacity: barOpacity }}>
            <LoadingBar flush />
          </Animated.View>
          <View
            className="absolute left-0 right-0 flex-row flex-wrap items-center justify-center px-6"
            style={{ top: -14 }}
          >
            {words.map((w, i) => {
              const start = WORDS_START + i * word;
              return (
                <Animated.View
                  key={w}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    opacity: between(start, start + 300, [0, 1]),
                    transform: [{ translateY: between(start, start + 300, [10, 0]) }],
                  }}
                >
                  {i > 0 ? (
                    <View aria-hidden className="mx-3 h-1.5 w-1.5 rounded-full bg-gold" />
                  ) : null}
                  <Text className="font-display text-[22px] text-navy-ink">{w}</Text>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      </Pressable>
      <Pressable
        role="button"
        aria-label={t.skipIntro}
        onPress={skip}
        className="absolute right-3 top-3 min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-4"
      >
        <Text className="font-figtree-semibold text-sm text-navy-ink">{t.skipIntro}</Text>
      </Pressable>
    </Animated.View>
  );
}
