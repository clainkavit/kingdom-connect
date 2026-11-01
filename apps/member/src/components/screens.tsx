import { memberNav, memberPhoneTabs, moreItems } from "@kingdom-connect/shared";
import { Text, View } from "react-native";
import { strings } from "../strings";
import { LinkButton } from "./link-button";
import { NavIcon } from "./nav-icon";
import { usePalette } from "./palette";
import { EmptyState } from "./states";

export function ScreenTitle({ children }: { children: string }) {
  return (
    <Text role="heading" aria-level={1} className="mb-4 font-figtree-bold text-xl text-ink">
      {children}
    </Text>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <View>
      <ScreenTitle>{title}</ScreenTitle>
      <EmptyState title={strings.comingSoonTitle} message={strings.comingSoonMessage} />
    </View>
  );
}

export function MoreList() {
  const palette = usePalette();
  return (
    <View className="rounded-card border border-line bg-surface">
      {moreItems(memberNav, memberPhoneTabs).map((item) => (
        <LinkButton
          key={item.href}
          href={item.href}
          className="flex-row items-center gap-3 border-b border-line px-4 py-3"
        >
          <NavIcon name={item.icon} color={palette.ink2} />
          <Text className="font-figtree-medium text-sm text-ink">{item.label}</Text>
        </LinkButton>
      ))}
    </View>
  );
}
