import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useLanguage } from "../lib/language";
import { Button } from "./form";

/** Below this width the screen is a phone: filters fold into a sheet so results show first. */
export const PHONE_MAX = 880;

export const usePhone = () => useWindowDimensions().width <= PHONE_MAX;

/**
 * On a phone, one "Filters" button showing how many are on, which opens a sheet that slides up with the
 * filters and Apply. Nothing changes until Apply, so a member can set several before the list reloads.
 */
export function FilterSheet({
  count,
  onApply,
  onClear,
  children,
}: {
  count: number;
  onApply: () => void;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const label = count > 0 ? t.filtersOn(count) : t.filtersTitle;
  return (
    <>
      <Pressable
        role="button"
        aria-label={label}
        aria-expanded={open}
        onPress={() => setOpen(true)}
        className={`min-h-[44px] flex-row items-center justify-center self-start rounded-full px-4 ${count > 0 ? "bg-navy" : "border border-line bg-surface"}`}
      >
        <Text className={`font-figtree-bold text-sm ${count > 0 ? "text-white" : "text-ink"}`}>
          {label}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View
            role="dialog"
            aria-label={t.filtersTitle}
            className="max-h-[88%] gap-3 rounded-t-[20px] bg-surface px-5 pb-6 pt-4"
          >
            <View className="flex-row items-center justify-between">
              <Text role="heading" aria-level={2} className="font-figtree-bold text-lg text-ink">
                {t.filtersTitle}
              </Text>
              <Pressable
                role="button"
                aria-label={t.closeSheet}
                onPress={() => setOpen(false)}
                className="min-h-[44px] justify-center px-2"
              >
                <Text className="font-figtree-semibold text-sm text-blue">{t.closeSheet}</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="gap-3 pb-2">{children}</ScrollView>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  secondary
                  label={t.clearFilters}
                  onPress={() => {
                    onClear();
                    setOpen(false);
                  }}
                />
              </View>
              <View className="flex-1">
                <Button
                  label={t.applyFilters}
                  onPress={() => {
                    onApply();
                    setOpen(false);
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
