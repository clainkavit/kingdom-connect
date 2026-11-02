import { memberNav } from "@kingdom-connect/shared";
import { Redirect, useLocalSearchParams } from "expo-router";
import { ComingSoon } from "../../src/components/screens";

export default function SectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const item = memberNav.find((i) => i.href !== "/" && i.href === `/${section}`);
  if (!item) return <Redirect href="/" />;
  return <ComingSoon title={item.label} />;
}
