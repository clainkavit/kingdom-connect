import {
  draftProblem,
  emptyTender,
  employmentTypes,
  opportunityProblem,
  parseSkills,
  postStepOf,
  postTypes,
  tanzaniaDate,
  tenderLimits,
  type EmploymentType,
  type OpportunityInput,
  type OpportunityProblem,
  type OpportunityResult,
  type PostType,
  type TenderInput,
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

export const typeLabel: Record<PostType, TextKey> = {
  job: "typeJob",
  partnership: "typePartnership",
  collaboration: "typeCollaboration",
  investment: "typeInvestment",
  tender: "typeTender",
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
  invalid_tender: "postInvalidTender",
  invalid_tender_file: "postInvalidTenderFile",
  failed: "postFailed",
};

const sentText: Partial<Record<PostStatus, TextKey>> = {
  draft: "postSavedDraft",
  pending_review: "postSentReview",
  published: "postPublished",
};

/** S20 in four short steps (12 Nov 2026): what it is, where, the details, then the no-fee tick and Send. */
const postSteps: TextKey[] = ["postStepWhat", "postStepWhere", "postStepDetails", "postStepSend"];

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
  tender: emptyTender,
};

/** S20's tender fields (O04). The issuing organisation is the poster's verified business. */
function TenderFields({
  api,
  tender,
  onChange,
}: {
  api: OpportunitiesApi;
  tender: TenderInput;
  onChange: (tender: TenderInput) => void;
}) {
  const { t } = useLanguage();
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TenderInput>(key: K, value: TenderInput[K]) =>
    onChange({ ...tender, [key]: value });

  const pick = async () => {
    const file = await api.pickPdf().catch(() => null);
    if (!file) return;
    if (file.mime !== "application/pdf" || file.size > tenderLimits.fileMaxBytes)
      return setFileProblem(t.tenderFileBad);
    setBusy(true);
    const path = await api.uploadTenderDocument(file).catch(() => null);
    setBusy(false);
    if (!path) return setFileProblem(t.postFailed);
    setFileProblem(null);
    set("documentPath", path);
  };

  return (
    <View className="gap-3 rounded-card border border-line p-3">
      <Text role="heading" aria-level={3} className="font-figtree-bold text-sm text-ink">
        {t.oppTenderTitle}
      </Text>
      <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.tenderIssuerNote}</Text>
      <Field
        label={t.fieldTenderRef}
        value={tender.referenceNo}
        onChange={(v) => set("referenceNo", v)}
      />
      <Field
        label={t.fieldTenderScope}
        value={tender.scope}
        onChange={(v) => set("scope", v)}
        hint={t.tenderScopeHint}
        multiline
      />
      <Field
        label={t.fieldTenderEligibility}
        value={tender.eligibility}
        onChange={(v) => set("eligibility", v)}
        multiline
      />
      <Field
        label={t.fieldTenderDocs}
        value={tender.requiredDocuments}
        onChange={(v) => set("requiredDocuments", v)}
        hint={t.tenderDocsHint}
        multiline
      />
      <Field
        label={t.fieldTenderTime}
        value={tender.closingTime}
        onChange={(v) => set("closingTime", v.trim())}
        hint={t.tenderTimeHint}
      />
      <Field
        label={t.fieldTenderValue}
        value={tender.estimatedValue}
        onChange={(v) => set("estimatedValue", v)}
        keyboardType="number-pad"
      />
      <View className="flex-row flex-wrap items-center gap-3">
        <Button
          secondary
          label={tender.documentPath ? t.tenderReplaceDocument : t.tenderAddDocument}
          onPress={pick}
          disabled={busy}
        />
        {tender.documentPath ? (
          <>
            <Text className="font-figtree text-sm text-ink">{t.tenderDocumentAdded}</Text>
            <Button
              secondary
              label={t.tenderRemoveDocument}
              onPress={() => set("documentPath", null)}
            />
          </>
        ) : (
          <Text className="font-figtree text-[13px] text-ink-2">{t.tenderDocumentHint}</Text>
        )}
      </View>
      <Message text={fileProblem} />
    </View>
  );
}

/** S20: post an opportunity or a tender, or edit a draft (O01, O04). */
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
  const [step, setStep] = useState(0);

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
  const input = { ...form, skills: parseSkills(skillsText) };
  const today = tanzaniaDate();
  const show = (p: OpportunityProblem) => setProblem(t[resultText[p]] as string);

  const save = async (send: boolean) => {
    const local = send
      ? opportunityProblem(input, { staff: false, today })
      : draftProblem(input, { today });
    if (local) {
      if (send) setStep(postStepOf(local));
      return show(local);
    }
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

  const next = () => {
    const local = opportunityProblem(input, { staff: false, today });
    if (local && postStepOf(local) <= step) {
      setStep(postStepOf(local));
      return show(local);
    }
    setProblem(null);
    setStep(step + 1);
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

  const last = step === postSteps.length - 1;
  return (
    <View className="gap-4">
      <ScreenTitle>{id ? t.editPostTitle : t.postTitle}</ScreenTitle>
      <LinkButton href="/opportunities/mine" label={t.myPostsTitle} className="py-1">
        <Text className="font-figtree-semibold text-sm text-blue">{t.myPostsTitle}</Text>
      </LinkButton>
      <Section title={t[postSteps[step]!] as string}>
        <Text className="font-figtree text-[13px] text-ink-2">
          {t.stepOf(step + 1, postSteps.length)}
        </Text>
        {step === 0 ? (
          <>
            <Chips
              label={t.fieldType}
              options={postTypes.map((k) => ({ value: k, label: t[typeLabel[k]] as string }))}
              value={form.type || undefined}
              onChange={(v) =>
                setForm((f) =>
                  f
                    ? {
                        ...f,
                        type: v,
                        role: v === "job" ? f.role : "",
                        employmentType: v === "job" ? f.employmentType : "",
                      }
                    : f,
                )
              }
            />
            <Field label={t.fieldPostTitle} value={form.title} onChange={(v) => set("title", v)} />
            {form.type === "job" ? (
              <>
                <Field label={t.fieldRole} value={form.role} onChange={(v) => set("role", v)} />
                <Chips
                  label={t.fieldEmployment}
                  options={employmentTypes.map((k) => ({
                    value: k,
                    label: t[employmentLabel[k]] as string,
                  }))}
                  value={form.employmentType || undefined}
                  onChange={(v) => set("employmentType", v)}
                />
              </>
            ) : null}
          </>
        ) : null}
        {step === 1 ? (
          <>
            <Switch
              label={t.fieldRemote}
              checked={form.remote}
              onChange={(v) => set("remote", v)}
            />
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
          </>
        ) : null}
        {step === 2 ? (
          <>
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
            {form.type === "tender" ? (
              <TenderFields api={api} tender={form.tender} onChange={(v) => set("tender", v)} />
            ) : null}
            <Field
              label={t.fieldSkills}
              value={skillsText}
              onChange={setSkillsText}
              hint={t.postSkillsHint}
            />
          </>
        ) : null}
        {last ? (
          <Checkbox label={t.noFeeTick} checked={form.noFee} onChange={(v) => set("noFee", v)} />
        ) : null}
        <Message text={problem} />
        <View className="flex-row flex-wrap gap-2">
          {step > 0 ? (
            <View className="min-w-[100px] flex-1">
              <Button
                secondary
                label={t.back}
                onPress={() => {
                  setProblem(null);
                  setStep(step - 1);
                }}
                disabled={busy}
              />
            </View>
          ) : null}
          <View className="min-w-[120px] flex-1">
            <Button secondary label={t.saveDraft} onPress={() => save(false)} disabled={busy} />
          </View>
          <View className="min-w-[120px] flex-1">
            {last ? (
              <Button label={t.sendPost} onPress={() => save(true)} disabled={busy} />
            ) : (
              <Button label={t.next} onPress={next} disabled={busy} />
            )}
          </View>
        </View>
      </Section>
    </View>
  );
}
