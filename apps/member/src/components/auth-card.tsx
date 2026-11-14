import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Eyebrow, LanguagePill, LegalLinks, LogoTile, Photo, VerifiedChip, WIDE } from "./landing";

/** The wizard's wide card shows the photo panel only where it still leaves the form its room. */
const WIDE_WITH_FORM = 1280;

/**
 * The frame of every signed-out screen (S02 to S08), from the Web-Login and Phone-Login designs:
 * on a computer the form sits on the left with the logo and the photo card on the right; on a
 * phone or tablet a photo strip with the logo and the language switch sits above the form.
 */
export function AuthCard({
  title,
  children,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const onLegal = (kind: "terms" | "privacy") => router.push(`/legal/${kind}`);

  const form = (
    <View role="main" className="w-full gap-3">
      <Text role="heading" aria-level={1} className="font-display text-[34px] leading-9 text-navy">
        {title}
      </Text>
      {children}
    </View>
  );

  if (width >= WIDE) {
    const photo = !wide || width >= WIDE_WITH_FORM;
    return (
      <View className="flex-1 flex-row gap-6 bg-bg p-6">
        <ScrollView
          className={wide ? "max-w-[760px] flex-1" : "max-w-[440px] flex-none"}
          style={wide ? undefined : { width: 440 }}
          contentContainerClassName="flex-grow justify-between gap-8 py-2 pl-4 pr-2"
        >
          <View className="flex-row items-center justify-between">
            <LogoTile size={80} />
            <LanguagePill />
          </View>
          {form}
          <LegalLinks onLegal={onLegal} />
        </ScrollView>
        {photo && (
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
        )}
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="flex-grow">
      <Photo style={{ height: width >= 640 ? 240 : 200 }}>
        <View className="flex-1 flex-row items-start justify-between p-5">
          <LogoTile size={56} />
          <LanguagePill onPhoto />
        </View>
      </Photo>
      <View
        className={`w-full flex-grow justify-between gap-8 self-center px-5 pb-6 pt-6 ${wide ? "max-w-[720px]" : "max-w-[480px]"}`}
      >
        {form}
        <LegalLinks onLegal={onLegal} />
      </View>
    </ScrollView>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      className="min-h-[44px] justify-center self-start"
    >
      <Text className="font-figtree-semibold text-sm text-blue">{label}</Text>
    </Pressable>
  );
}
