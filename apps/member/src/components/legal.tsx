import {
  fillLegalText,
  isDraftVersion,
  legalBlocks,
  type LegalKind,
  type TextKey,
} from "@kingdom-connect/shared";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { PendingText } from "../lib/legal";
import { Checkbox } from "./form";

export const legalTitleKeys: Record<LegalKind, TextKey> = {
  terms: "legalTerms",
  privacy: "legalPrivacy",
  nda: "legalNda",
  ip: "legalIp",
  handoff: "legalHandoff",
};

export function LegalTextView({ body, entityName }: { body: string; entityName: string }) {
  const { platformName } = useLanguage();
  const blocks = legalBlocks(
    fillLegalText(body, { entity_name: entityName || platformName, platform_name: platformName }),
  );
  return (
    <View className="gap-2">
      {blocks.map((block, i) =>
        block.kind === "heading" ? (
          <Text
            key={i}
            role="heading"
            aria-level={i === 0 ? 2 : 3}
            className={`font-figtree-bold text-ink ${i === 0 ? "text-lg" : "mt-2 text-base"}`}
          >
            {block.text}
          </Text>
        ) : block.kind === "bullet" ? (
          <View key={i} className="flex-row gap-2 pl-1">
            <Text aria-hidden className="font-figtree text-sm text-ink-2">
              •
            </Text>
            <Text className="flex-1 font-figtree text-sm leading-5 text-ink-2">{block.text}</Text>
          </View>
        ) : (
          <Text key={i} className="font-figtree text-sm leading-5 text-ink-2">
            {block.text}
          </Text>
        ),
      )}
    </View>
  );
}

export function AcceptTexts({
  texts,
  entityName,
  onAccept,
  intro,
  acceptLabel,
}: {
  texts: PendingText[];
  entityName: string;
  onAccept: (ids: string[]) => Promise<void>;
  intro?: string;
  acceptLabel?: string;
}) {
  const { t, language, platformName } = useLanguage();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const allTicked = texts.every((text) => ticked[text.id]);

  const submit = async () => {
    setBusy(true);
    try {
      await onAccept(texts.map((text) => text.id));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      <Text className="font-figtree text-sm leading-5 text-ink-2">
        {intro ?? t.acceptUpdatedIntro(platformName)}
      </Text>
      {texts.map((text) => {
        const name = t[legalTitleKeys[text.kind]];
        return (
          <View key={text.id} className="gap-3 rounded-card border border-line p-4">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-figtree-semibold text-xs text-ink-2">
                {t.legalVersion(text.version)}
              </Text>
              {isDraftVersion(text.version, text.approved_at) ? (
                <View className="rounded-full bg-warn-soft px-2.5 py-0.5">
                  <Text className="font-figtree-semibold text-xs text-warn-text">
                    {t.legalDraft}
                  </Text>
                </View>
              ) : null}
            </View>
            <ScrollView className="max-h-72" nestedScrollEnabled>
              <LegalTextView
                body={language === "sw" ? text.body_sw : text.body_en}
                entityName={entityName}
              />
            </ScrollView>
            <Checkbox
              label={t.acceptText(name.toLowerCase())}
              checked={Boolean(ticked[text.id])}
              onChange={(next) => setTicked({ ...ticked, [text.id]: next })}
            />
          </View>
        );
      })}
      <Text className="font-figtree text-xs text-ink-2">{t.englishGoverns}</Text>
      {failed ? (
        <View role="alert" className="rounded-[10px] bg-bad-soft px-3 py-2.5">
          <Text className="font-figtree text-[13px] text-bad-text">{t.network}</Text>
        </View>
      ) : null}
      <Pressable
        role="button"
        aria-label={acceptLabel ?? t.continueLabel}
        aria-disabled={!allTicked || busy}
        disabled={!allTicked || busy}
        onPress={submit}
        className={`min-h-[48px] items-center justify-center rounded-[10px] bg-blue px-4 ${!allTicked || busy ? "opacity-50" : ""}`}
      >
        <Text className="font-figtree-bold text-[15px] text-blue-ink">
          {acceptLabel ?? t.continueLabel}
        </Text>
      </Pressable>
    </View>
  );
}
