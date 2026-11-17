import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

/** What a detail page shows in the maroon band on a phone, as on the canvas: Back, the title and a line. */
export type PhoneHeader = {
  /**
   * `short` is the word shown in the band; the band says Back without it. `onPress` replaces following
   * `href`, for a back step inside the page such as a wizard's previous step.
   */
  back?: { label: string; href: string; short?: string; onPress?: () => void };
  title: string;
  subtitle?: string;
  /** Shown left of the title, such as a member's photo. */
  leading?: React.ReactNode;
  /** A second subtitle line, such as the member's place. */
  detail?: string;
  /**
   * The home band: keeps the logo, bell and avatar, then shows `detail` (date and place), the title,
   * the subtitle and `below` (badges) under them.
   */
  home?: boolean;
  below?: React.ReactNode;
};

type Slot = {
  header: PhoneHeader | null;
  set: ((header: PhoneHeader | null) => void) | null;
};

const PhoneHeaderContext = createContext<Slot>({ header: null, set: null });

export function PhoneHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, set] = useState<PhoneHeader | null>(null);
  return (
    <PhoneHeaderContext.Provider value={{ header, set }}>{children}</PhoneHeaderContext.Provider>
  );
}

export const usePhoneHeaderSlot = () => useContext(PhoneHeaderContext).header;

/**
 * Puts this page's back link and title in the phone band while the page is shown. Returns true when the
 * band shows them, so the page leaves its own title out. Outside the app shell there is no band.
 */
export function usePhoneHeader(header: PhoneHeader | null, active: boolean): boolean {
  const { set } = useContext(PhoneHeaderContext);
  const onBack = useRef(header?.back?.onPress);
  onBack.current = header?.back?.onPress;
  const key = header
    ? `${header.back?.href ?? ""}|${header.back?.label ?? ""}|${header.title}|${header.subtitle ?? ""}|${header.detail ?? ""}|${header.leading ? 1 : 0}|${header.back?.onPress ? 1 : 0}|${header.home ? 1 : 0}|${header.below ? 1 : 0}`
    : "";
  useEffect(() => {
    if (!active || !header || !set) return;
    set(
      header.back?.onPress
        ? { ...header, back: { ...header.back, onPress: () => onBack.current?.() } }
        : header,
    );
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, set]);
  return active && header !== null && set !== null;
}

/** Shows a detail page's Back and title in the phone band; outside the app shell, shows the title here. */
export function InPhoneBand(header: PhoneHeader) {
  const inBand = usePhoneHeader(header, true);
  if (inBand) return null;
  return (
    <View className="gap-1">
      <Text role="heading" aria-level={1} className="font-figtree-extrabold text-[24px] text-navy">
        {header.title}
      </Text>
      {header.subtitle ? (
        <Text className="font-figtree text-[15px] text-ink">{header.subtitle}</Text>
      ) : null}
      {header.detail ? (
        <Text className="font-figtree text-[14px] text-ink-2">{header.detail}</Text>
      ) : null}
    </View>
  );
}
