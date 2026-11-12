import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { Button } from "./form";
import { Sheet } from "./sheet";

export { PHONE_MAX, usePhone } from "./sheet";

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
      <Sheet
        open={open}
        title={t.filtersTitle}
        onClose={() => setOpen(false)}
        footer={
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
        }
      >
        {children}
      </Sheet>
    </>
  );
}
