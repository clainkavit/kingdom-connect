import { motion } from "@kingdom-connect/shared";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, View } from "react-native";

/** How long things take to come in and go out, in milliseconds. */
export const ENTER_MS = motion.enter;
export const EXIT_MS = motion.exit;

const native = Platform.OS !== "web";

/** True when the phone or computer is set to reduce motion; every animation here is skipped then. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(
      (on) => live && setReduced(on),
      () => undefined,
    );
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

type From = "fade" | "above" | "below";

const offset: Record<From, number> = { fade: 0, above: -6, below: 16 };

/**
 * Shows its children with a short fade and slide while `show` is true, and plays the same in reverse before
 * taking them away. While leaving it is hidden from screen readers and takes no taps. `style` places the
 * moving layer; `className` styles the content inside it.
 */
export function Reveal({
  show = true,
  from = "fade",
  className,
  style,
  onGone,
  children,
  ...rest
}: {
  show?: boolean;
  from?: From;
  onGone?: () => void;
  className?: string;
  style?: object;
  children: React.ReactNode;
} & Record<string, unknown>) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(show && !reduced ? 0 : 1)).current;
  const [mounted, setMounted] = useState(show);
  const present = useRef(show);

  useEffect(() => {
    const finish = () => {
      if (!present.current) return;
      present.current = false;
      setMounted(false);
      onGone?.();
    };
    if (show) {
      present.current = true;
      setMounted(true);
    }
    if (reduced) {
      progress.setValue(show ? 1 : 0);
      if (!show) finish();
      return;
    }
    const run = Animated.timing(progress, {
      toValue: show ? 1 : 0,
      duration: show ? ENTER_MS : EXIT_MS,
      easing: show ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: native,
    });
    run.start(({ finished }) => {
      if (finished && !show) finish();
    });
    return () => run.stop();
  }, [show, reduced, progress]);

  if (!mounted) return null;
  const leaving = !show;
  return (
    <Animated.View
      {...rest}
      aria-hidden={leaving || undefined}
      pointerEvents={leaving ? "none" : undefined}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [offset[from], 0],
              }),
            },
          ],
        },
      ]}
    >
      <View className={className}>{children}</View>
    </Animated.View>
  );
}

/** Fades its children in again each time `value` changes, such as the page address or the chosen tab, without rebuilding them. */
export function EnterOnChange({
  value,
  className,
  children,
}: {
  value: unknown;
  className?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    });
    run.start();
    return () => run.stop();
  }, [value, reduced, progress]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) },
        ],
      }}
    >
      <View className={className}>{children}</View>
    </Animated.View>
  );
}

/**
 * A Pressable that shrinks slightly while pressed and springs back, so every tap gets a visible
 * answer. Skipped when reduce motion is on.
 */
export function PressScale({
  className,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: React.ComponentProps<typeof Pressable> & { className?: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: motion.press,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    }).start();
  return (
    <Animated.View style={[style as object, { transform: [{ scale }] }]}>
      <Pressable
        {...rest}
        disabled={disabled}
        className={className}
        onPressIn={(e) => {
          if (!reduced && !disabled) to(0.97);
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          to(1);
          onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
