import { MAX_SKILLS, normalizeSkill, type SetSkillsResult } from "@kingdom-connect/shared";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { useLoad } from "./events";
import { Message } from "./form";

export type MySkillsApi = {
  load: () => Promise<string[]>;
  set: (skills: string[]) => Promise<SetSkillsResult>;
};

/** O12: on a post, which of its skills the member has, with a way to add a missing one to their profile. */
export function YourSkillsForPost({ skills, api }: { skills: string[]; api: MySkillsApi }) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const mine = useLoad(() => api.load().catch(() => [] as string[]), attempt);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (mine.state !== "ready") return null;
  const have = new Set(mine.value.map((s) => normalizeSkill(s)));
  const matched = skills.filter((s) => have.has(normalizeSkill(s))).length;

  const add = async (skill: string) => {
    setBusy(true);
    const result = await api.set([...mine.value, skill]).catch(() => "failed" as const);
    setBusy(false);
    if (result === "done") {
      setProblem(null);
      return setAttempt((a) => a + 1);
    }
    setProblem(result === "too_many" ? t.skillTooMany(MAX_SKILLS) : t.oppSkillAddFailed);
  };

  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-4">
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text role="heading" aria-level={2} className="font-figtree-bold text-[16px] text-ink">
          {t.oppYourSkillsTitle}
        </Text>
        <Text className="font-figtree-bold text-sm text-good-text">
          {t.oppYourSkillsCount(matched, skills.length)}
        </Text>
      </View>
      {skills.map((skill) => {
        const owned = have.has(normalizeSkill(skill));
        return (
          <View
            key={skill}
            className="min-h-[44px] flex-row items-center justify-between gap-3 border-t border-line"
          >
            <Text className={`font-figtree text-[15px] ${owned ? "text-ink" : "text-ink-2"}`}>
              {skill}
            </Text>
            {owned ? (
              <Text className="rounded-full bg-good-soft px-2.5 py-1 font-figtree-bold text-[13px] text-good-text">
                {t.oppHaveIt}
              </Text>
            ) : (
              <Pressable
                role="button"
                aria-label={t.oppAddToMySkills(skill)}
                disabled={busy}
                onPress={() => add(skill)}
                className="min-h-[40px] justify-center rounded-full border border-navy px-3"
              >
                <Text className="font-figtree-bold text-[13px] text-navy">{t.oppIHaveThis}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Message text={problem} />
    </View>
  );
}
