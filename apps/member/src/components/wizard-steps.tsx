import {
  categoryFields,
  type CategoryDetails,
  draftCategories,
  type FieldProblem,
  idTypes,
  type IdType,
  type MemberCategory,
  type RegistrationDraft,
  selectableCategories,
  type Strings,
  type TextKey,
} from "@kingdom-connect/shared";
import { useState } from "react";
import Camera from "lucide-react-native/icons/camera";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { Option } from "../lib/registration";
import {
  Button,
  Checkbox,
  ChoiceList,
  Chips,
  Field,
  Message,
  PrivacyNote,
  problemText,
} from "./form";
import { usePalette } from "./palette";

export type StepProps = {
  draft: RegistrationDraft;
  update: (change: Partial<RegistrationDraft>) => void;
  problems: Record<string, FieldProblem>;
};

const categoryLabel: Record<MemberCategory, TextKey> = {
  professional: "categoryProfessional",
  businessperson: "categoryBusinessperson",
  entrepreneur: "categoryEntrepreneur",
  other: "categoryOther",
};

const categoryHintKey: Record<MemberCategory, TextKey> = {
  professional: "categoryHintProfessional",
  businessperson: "categoryHintBusiness",
  entrepreneur: "categoryHintEntrepreneur",
  other: "categoryHintOther",
};

const idTypeLabel: Record<IdType, TextKey> = {
  nida: "idNida",
  passport: "idPassport",
  driving_licence: "idDrivingLicence",
  voters_id: "idVotersId",
};

const detailLabel: Record<keyof CategoryDetails, TextKey> = {
  profession: "profession",
  certifications: "certificationsLabel",
  businessName: "businessName",
  sectorId: "sector",
  building: "building",
  description: "describeYourself",
};

const say = (t: Strings, problems: Record<string, FieldProblem>, field: string) =>
  problemText(t, problems[field]);

export function PersonalStep({
  draft,
  update,
  problems,
  regions,
  districts,
}: StepProps & { regions: Option[]; districts: Option[] }) {
  const { t } = useLanguage();
  const study = draft.study ?? {};
  return (
    <View className="gap-3">
      <Field
        label={t.fullName}
        value={draft.fullName ?? ""}
        onChange={(fullName) => update({ fullName })}
        problem={say(t, problems, "fullName")}
      />
      {draft.needsPhone ? (
        <Field
          label={t.phone}
          value={draft.phone ?? ""}
          onChange={(phone) => update({ phone })}
          keyboardType="phone-pad"
          problem={say(t, problems, "phone")}
        />
      ) : null}
      <ChoiceList
        label={t.region}
        options={regions}
        value={draft.regionId}
        onChange={(regionId) => update({ regionId, districtId: undefined })}
        problem={say(t, problems, "regionId")}
      />
      <ChoiceList
        label={t.district}
        options={districts}
        value={draft.districtId}
        onChange={(districtId) => update({ districtId })}
        disabled={!draft.regionId}
        problem={say(t, problems, "districtId")}
      />
      <Field
        label={t.addressLabel}
        value={draft.address ?? ""}
        onChange={(address) => update({ address })}
        problem={say(t, problems, "address")}
      />
      <Text className="mt-2 font-figtree-bold text-sm text-ink">{t.studyOptional}</Text>
      <Field
        label={t.studyInstitution}
        value={study.institution ?? ""}
        onChange={(institution) => update({ study: { ...study, institution } })}
        problem={say(t, problems, "study.institution")}
      />
      <Field
        label={t.studyCourse}
        value={study.course ?? ""}
        onChange={(course) => update({ study: { ...study, course } })}
      />
      <Field
        label={t.studyYear}
        value={study.year ? String(study.year) : ""}
        keyboardType="number-pad"
        onChange={(year) =>
          update({ study: { ...study, year: year.trim() ? Number(year) : undefined } })
        }
        problem={say(t, problems, "study.year")}
      />
    </View>
  );
}

/** The details fields of the ticked categories, each field once. */
const fieldsFor = (categories: MemberCategory[]): (keyof CategoryDetails)[] => [
  ...new Set(categories.flatMap((c) => categoryFields[c].map(({ field }) => field))),
];

/** S05 step 2 (R19, #161): tick every category that applies, at least one. */
export function CategoryStep({ draft, update, problems }: StepProps) {
  const { t } = useLanguage();
  const chosen = draftCategories(draft).filter((c) => selectableCategories.includes(c));
  const toggle = (category: MemberCategory, on: boolean) => {
    const categories = selectableCategories.filter((c) =>
      c === category ? on : chosen.includes(c),
    );
    const keep = new Set(fieldsFor(categories));
    const details = Object.fromEntries(
      Object.entries(draft.categoryDetails ?? {}).filter(([field]) =>
        keep.has(field as keyof CategoryDetails),
      ),
    ) as CategoryDetails;
    update({ categories, category: undefined, categoryDetails: details });
  };
  return (
    <View role="group" aria-label={t.stepCategory} className="gap-2">
      <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">{t.categoryIntro}</Text>
      {selectableCategories.map((category) => (
        <View key={category}>
          <Checkbox
            label={t[categoryLabel[category]]}
            checked={chosen.includes(category)}
            onChange={(on) => toggle(category, on)}
          />
          <Text className="-mt-2 pl-8 font-figtree text-[13px] text-ink-2">
            {t[categoryHintKey[category]] as string}
          </Text>
        </View>
      ))}
      <Message text={say(t, problems, "category")} />
    </View>
  );
}

export function DetailsStep({
  draft,
  update,
  problems,
  sectors,
}: StepProps & { sectors: Option[] }) {
  const { t } = useLanguage();
  const categories = draftCategories(draft);
  if (categories.length === 0) return <Message text={t.problemRequired} />;
  const details = draft.categoryDetails ?? {};
  const shown = new Set<keyof CategoryDetails>();
  const input = (field: keyof CategoryDetails) =>
    field === "sectorId" ? (
      <ChoiceList
        key={field}
        label={t.sector}
        options={sectors}
        value={details.sectorId}
        onChange={(sectorId) => update({ categoryDetails: { ...details, sectorId } })}
        problem={say(t, problems, `categoryDetails.${field}`)}
      />
    ) : (
      <Field
        key={field}
        label={t[detailLabel[field]]}
        value={details[field] ?? ""}
        multiline={field === "description" || field === "building"}
        hint={field === "certifications" ? t.certificationsHint : undefined}
        onChange={(value) => update({ categoryDetails: { ...details, [field]: value } })}
        problem={say(t, problems, `categoryDetails.${field}`)}
      />
    );
  return (
    <View className="gap-4">
      {categories.map((category) => {
        const fields = categoryFields[category]
          .map(({ field }) => field)
          .filter((field) => !shown.has(field) && shown.add(field));
        if (fields.length === 0) return null;
        return (
          <View key={category} className="gap-3">
            <Text className="font-figtree-bold text-[15px] text-ink">
              {t[categoryLabel[category]]}
            </Text>
            {fields.map(input)}
          </View>
        );
      })}
      <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t.detailsNoDocsNote}</Text>
    </View>
  );
}

function PhotoPicker({
  label,
  hint,
  added,
  busy,
  onPick,
  problem,
}: {
  label: string;
  hint: string;
  added: boolean;
  busy: boolean;
  onPick: () => void;
  problem?: string | null;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View className="min-w-[220px] flex-1 gap-1.5">
      <Text className="font-figtree-semibold text-sm text-ink">{label}</Text>
      <Pressable
        role="button"
        aria-label={added ? t.replacePhoto : t.choosePhoto}
        aria-disabled={busy}
        disabled={busy}
        onPress={onPick}
        className={`min-h-[124px] items-center justify-center gap-1.5 rounded-[18px] border border-dashed px-4 py-4 ${added ? "border-good bg-good-soft" : "border-line-2 bg-surface-2"}`}
      >
        <Camera size={22} color={added ? palette.good : palette.ink} aria-hidden />
        <Text className="font-figtree-bold text-[14px] text-ink">
          {added ? t.replacePhoto : t.photoTakeOrUpload}
        </Text>
        {added ? (
          <Text className="font-figtree-semibold text-[13px] text-good-text">{t.photoAdded}</Text>
        ) : (
          <Text className="font-figtree text-[12px] text-ink-2">{hint}</Text>
        )}
      </Pressable>
      {problem ? <Text className="font-figtree text-[13px] text-bad-text">{problem}</Text> : null}
    </View>
  );
}

export function IdentityStep({
  draft,
  update,
  problems,
  onSaveId,
  onPickPhoto,
  busy,
  idMessage,
  idProblem,
}: StepProps & {
  onSaveId: (idNumber: string) => void;
  onPickPhoto: (kind: "face" | "id") => void;
  busy: boolean;
  idMessage: string | null;
  idProblem: FieldProblem | null;
}) {
  const { t } = useLanguage();
  const [idNumber, setIdNumber] = useState("");
  const [askedEarly, setAskedEarly] = useState(false);
  const ready = Boolean(draft.idType && idNumber.trim());
  return (
    <View className="gap-3">
      <Chips
        label={t.idType}
        options={idTypes.map((value) => ({ value, label: t[idTypeLabel[value]] }))}
        value={draft.idType}
        onChange={(idType) => update({ idType, identitySaved: false })}
        problem={say(t, problems, "idType")}
      />
      <Field
        label={t.idNumber}
        value={idNumber}
        onChange={setIdNumber}
        hint={draft.identitySaved ? t.idSaved : undefined}
        problem={problemText(t, idProblem ?? undefined) ?? say(t, problems, "idNumber")}
        privacy={t.privacyIdNumber}
      />
      <Field
        label={t.idExpiresOn}
        value={draft.idExpiresOn ?? ""}
        onChange={(idExpiresOn) => update({ idExpiresOn, identitySaved: false })}
      />
      <Message text={askedEarly && !ready ? t.needIdTypeAndNumber : idMessage} />
      <Button
        secondary
        label={t.saveId}
        onPress={() => (ready ? onSaveId(idNumber) : setAskedEarly(true))}
        disabled={busy}
      />
      <Text className="font-figtree text-[13px] text-ink-2">{t.photoRules}</Text>
      <View className="flex-row flex-wrap gap-3">
        <PhotoPicker
          label={t.facePhoto}
          hint={t.photoFaceHint}
          added={Boolean(draft.facePhoto)}
          busy={busy}
          onPick={() => onPickPhoto("face")}
          problem={say(t, problems, "facePhoto")}
        />
        <PhotoPicker
          label={t.idPhoto}
          hint={t.photoIdHint}
          added={Boolean(draft.idPhoto)}
          busy={busy}
          onPick={() => onPickPhoto("id")}
          problem={say(t, problems, "idPhoto")}
        />
      </View>
      <PrivacyNote text={t.photosPrivate} />
    </View>
  );
}

export function ReviewStep({
  draft,
  labelOf,
  onEdit,
}: {
  draft: RegistrationDraft;
  labelOf: (kind: "region" | "district" | "sector", id: string | undefined) => string | undefined;
  onEdit: (step: number) => void;
}) {
  const { t } = useLanguage();
  const details = draft.categoryDetails ?? {};
  const place = [labelOf("district", draft.districtId), labelOf("region", draft.regionId)]
    .filter(Boolean)
    .join(", ");
  const work = [
    details.profession,
    details.businessName,
    labelOf("sector", details.sectorId),
    details.description,
  ]
    .filter(Boolean)
    .join(" · ");
  const photos = [draft.idPhoto ? t.idPhoto : null, draft.facePhoto ? t.facePhoto : null]
    .filter(Boolean)
    .join(", ");
  const rows: { step: number; label: string; value: string }[] = [
    {
      step: 1,
      label: t.stepPersonal,
      value: [draft.fullName, place, draft.address].filter(Boolean).join(" · "),
    },
    {
      step: 2,
      label: t.stepCategory,
      value: draftCategories(draft)
        .map((c) => t[categoryLabel[c]])
        .join(", "),
    },
    { step: 3, label: t.stepCategoryDetails, value: work },
    {
      step: 4,
      label: t.stepIdentity,
      value: [
        draft.idType ? t[idTypeLabel[draft.idType]] : null,
        draft.identitySaved ? t.idSavedShort : null,
        photos ? t.photosAddedList(photos) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
  return (
    <View className="gap-1">
      <Text className="pb-2 font-figtree text-sm leading-5 text-ink-2">{t.reviewIntro}</Text>
      {rows.map((row) => (
        <View
          key={row.step}
          className="min-h-[56px] flex-row items-center gap-3 border-t border-line py-3"
        >
          <View className="flex-1 gap-0.5">
            <Text className="font-figtree-bold text-[13px] text-ink-2">{row.label}</Text>
            <Text className="font-figtree text-[15px] text-ink">{row.value || t.notGiven}</Text>
          </View>
          <Pressable
            role="button"
            aria-label={`${t.edit}: ${row.label}`}
            onPress={() => onEdit(row.step)}
            className="min-h-[44px] justify-center px-2"
          >
            <Text className="font-figtree-semibold text-sm text-navy underline">{t.edit}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
