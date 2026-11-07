import {
  employmentTypes,
  opportunityProblem,
  opportunityTypes,
  parseSkills,
  tanzaniaDate,
  type EmploymentType,
  type OpportunityInput,
  type OpportunityResult,
  type OpportunityType,
  type TextKey,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { OpportunitiesApi, PostStatus } from "../lib/opportunities";
import type { Option } from "../lib/registration";
import { Button, Checkbox, ChoiceList, Chips, Field, Message, Switch } from "./form";
import { LinkButton } from "./link-button";
import { Section } from "./profile";
import { ScreenTitle } from "./screens";
import { ErrorState, LoadingRows } from "./states";

export const typeLabel: Record<OpportunityType | "tender", TextKey> = {
  job: "typeJob",
  partnership: "typePartnership",
  collaboration: "typeCollaboration",
  investment: "typeInvestment",
  tender: "typeInvestment",
};

const employmentLabel: Record<EmploymentType, TextKey> = {
  full_time: "empFullTime",
  part_time: "empPartTime",
  contract: "empContract",
  internship: "empInternship",
};

const resultText: Record<Exclude<OpportunityResult, "ok">, TextKey> = {
  invalid_type: "postInvalidType",
  invalid_title: "postInvalidTitle",
  invalid_employment: "postInvalidEmployment",
  invalid_location: "postInvalidLocation",
  invalid_sector: "postInvalidSector",
  too_short: "postTooShort",
  too_long: "postTooLong",
  invalid_closing: "postInvalidClosing",
  skills_required: "postSkillsRequired",
  too_many_skills: "postTooManySkills",
  no_fee_required: "postNoFee",
  level3_required: "postLevel3",
  posting_paused: "postPaused",
  not_editable: "postNotEditable",
  contact_details: "postHasContact",
  failed: "postFailed",
};

const sentText: Partial<Record<PostStatus, TextKey>> = {
  draft: "postSavedDraft",
  pending_review: "postSentReview",
  published: "postPublished",
};

const emptyPost: OpportunityInput = {
  type: "",
  title: "",
  role: "",
  employmentType: "",
  remote: false,
  regionId: "",
  districtId: "",
  sectorId: "",
  description: "",
  closingOn: "",
  skills: [],
  noFee: false,
};

/** S20: post an opportunity or edit a draft (O01). */
export function OpportunityFormScreen({ api, id }: { api: OpportunitiesApi; id?: string }) {
  const { t, language } = useLanguage();
  const [form, setForm] = useState<OpportunityInput | null>(id ? null : emptyPost);
  const [skillsText, setSkillsText] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [sectors, setSectors] = useState<Option[]>([]);
  const [regions, setRegions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.sectors(language).then(setSectors, () => undefined);
    api.regions(language).then(setRegions, () => undefined);
  }, [api, language]);

  useEffect(() => {
    if (!id) return;
    api.load(id).then(
      (loaded) => {
        if (!loaded) return setLoadFailed(true);
        setForm(loaded);
        setSkillsText(loaded.skills.join(", "));
      },
      () => setLoadFailed(true),
    );
  }, [api, id]);

  const regionId = form?.regionId ?? "";
  useEffect(() => {
    if (!regionId) return setDistricts([]);
    api.districts(regionId, language).then(setDistricts, () => undefined);
  }, [api, regionId, language]);

  if (loadFailed) return <ErrorState message={t.postFailed} onRetry={() => setLoadFailed(false)} />;
  if (!form) return <LoadingRows />;

  const set = <K extends keyof OpportunityInput>(key: K, value: OpportunityInput[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const submit = async (send: boolean) => {
    const input = { ...form, skills: parseSkills(skillsText) };
    const local = opportunityProblem(input, { staff: false, today: tanzaniaDate() });
    if (local) return setProblem(t[resultText[local]] as string);
    setProblem(null);
    setBusy(true);
    const saved = await api
      .save(input, id ?? null, send)
      .catch(() => ({ result: "failed" as const, status: null }));
    setBusy(false);
    if (saved.result !== "ok") return setProblem(t[resultText[saved.result]] as string);
    const key = saved.status ? sentText[saved.status] : undefined;
    setDone(key ? (t[key] as string) : t.postSavedDraft);
  };

  if (done)
    return (
      <View className="gap-4">
        <ScreenTitle>{id ? t.editPostTitle : t.postTitle}</ScreenTitle>
        <Message tone="info" text={done} />
        <LinkButton href="/opportunities/mine" label={t.myPostsTitle} className="py-1">
          <Text className="font-figtree-semibold text-sm text-blue">{t.myPostsTitle}</Text>
        </LinkButton>
      </View>
    );

  return (
    <View className="gap-4">
      <ScreenTitle>{id ? t.editPostTitle : t.postTitle}</ScreenTitle>
      <LinkButton href="/opportunities/mine" label={t.myPostsTitle} className="py-1">
        <Text className="font-figtree-semibold text-sm text-blue">{t.myPostsTitle}</Text>
      </LinkButton>
      <Section title={t.postTitle}>
        <Chips
          label={t.fieldType}
          options={opportunityTypes.map((k) => ({ value: k, label: t[typeLabel[k]] as string }))}
          value={form.type || undefined}
          onChange={(v) =>
            setForm((f) =>
              f ? { ...f, type: v, employmentType: v === "job" ? f.employmentType : "" } : f,
            )
          }
        />
        <Field label={t.fieldPostTitle} value={form.title} onChange={(v) => set("title", v)} />
        <Field label={t.fieldRole} value={form.role} onChange={(v) => set("role", v)} />
        {form.type === "job" ? (
          <Chips
            label={t.fieldEmployment}
            options={employmentTypes.map((k) => ({
              value: k,
              label: t[employmentLabel[k]] as string,
            }))}
            value={form.employmentType || undefined}
            onChange={(v) => set("employmentType", v)}
          />
        ) : null}
        <Switch label={t.fieldRemote} checked={form.remote} onChange={(v) => set("remote", v)} />
        {!form.remote ? (
          <>
            <ChoiceList
              label={t.region}
              options={regions}
              value={form.regionId || undefined}
              onChange={(v) => setForm((f) => (f ? { ...f, regionId: v, districtId: "" } : f))}
            />
            <ChoiceList
              label={t.district}
              options={districts}
              value={form.districtId || undefined}
              onChange={(v) => set("districtId", v)}
              disabled={!form.regionId}
            />
          </>
        ) : null}
        <ChoiceList
          label={t.businessSector}
          options={sectors}
          value={form.sectorId || undefined}
          onChange={(v) => set("sectorId", v)}
        />
        <Field
          label={t.fieldDescription}
          value={form.description}
          onChange={(v) => set("description", v)}
          hint={t.descriptionHint}
          multiline
        />
        <Field
          label={t.fieldClosing}
          value={form.closingOn}
          onChange={(v) => set("closingOn", v.trim())}
          hint={t.closingHint}
        />
        <Field
          label={t.fieldSkills}
          value={skillsText}
          onChange={setSkillsText}
          hint={t.postSkillsHint}
        />
        <Checkbox label={t.noFeeTick} checked={form.noFee} onChange={(v) => set("noFee", v)} />
        <Message text={problem} />
        <View className="flex-row flex-wrap gap-2">
          <View className="min-w-[140px] flex-1">
            <Button secondary label={t.saveDraft} onPress={() => submit(false)} disabled={busy} />
          </View>
          <View className="min-w-[140px] flex-1">
            <Button label={t.sendPost} onPress={() => submit(true)} disabled={busy} />
          </View>
        </View>
      </Section>
    </View>
  );
}
