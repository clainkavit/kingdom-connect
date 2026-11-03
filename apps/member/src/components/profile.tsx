import {
  addSkill,
  MAX_SKILL_LENGTH,
  MAX_SKILLS,
  profileLimits,
  type SkillProblem,
} from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { Option } from "../lib/registration";
import type { Profile, ProfileApi, ProfileChanges } from "../lib/profile";
import { Button, ChoiceList, Field, Message } from "./form";
import { LinkButton } from "./link-button";
import { ScreenTitle } from "./screens";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-4">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-base text-ink">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Body({ text }: { text: string }) {
  return <Text className="font-figtree text-[15px] leading-[22px] text-ink">{text}</Text>;
}

function Muted({ text }: { text: string }) {
  return <Text className="font-figtree text-sm text-ink-2">{text}</Text>;
}

export function Avatar({
  name,
  url,
  size = 72,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (url)
    return (
      <Image
        source={{ uri: url }}
        accessibilityLabel={name}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="items-center justify-center bg-navy"
    >
      <Text className="font-figtree-bold text-xl text-white">{initials}</Text>
    </View>
  );
}

function SkillChips({ skills, onRemove }: { skills: string[]; onRemove?: (s: string) => void }) {
  const { t } = useLanguage();
  return (
    <View className="flex-row flex-wrap gap-2">
      {skills.map((skill) => (
        <View
          key={skill}
          className="flex-row items-center gap-1.5 rounded-full bg-blue-soft px-3 py-1.5"
        >
          <Text className="font-figtree-semibold text-sm text-info-text">{skill}</Text>
          {onRemove ? (
            <Pressable
              role="button"
              aria-label={t.removeSkill(skill)}
              onPress={() => onRemove(skill)}
              className="h-6 w-6 items-center justify-center"
            >
              <Text className="font-figtree-bold text-sm text-info-text">×</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** S11: a member's profile. Contact details show only when the server returns them for a connection. */
export function ProfileView({ profile }: { profile: Profile }) {
  const { t } = useLanguage();
  const study = [profile.study.institution, profile.study.course, profile.study.year?.toString()]
    .filter(Boolean)
    .join(", ");
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center gap-4">
        <Avatar name={profile.fullName} url={profile.photoUrl} />
        <View className="min-w-[200px] flex-1 gap-1">
          <Text
            role="heading"
            aria-level={1}
            className="font-figtree-extrabold text-[24px] text-ink"
          >
            {profile.fullName}
          </Text>
          {profile.headline ? <Body text={profile.headline} /> : null}
          {profile.location ? <Muted text={profile.location} /> : null}
        </View>
        {profile.own ? (
          <LinkButton
            href="/profile/edit"
            label={t.editProfile}
            className="min-h-[44px] justify-center rounded-[9px] border border-line bg-surface px-4"
          >
            <Text className="font-figtree-semibold text-sm text-ink-2">{t.editProfile}</Text>
          </LinkButton>
        ) : null}
      </View>
      {profile.own && profile.hidden ? <Message tone="info" text={t.hiddenProfileNote} /> : null}
      <Section title={t.aboutTitle}>
        {profile.profession ? <Body text={profile.profession} /> : null}
        {profile.bio ? <Body text={profile.bio} /> : null}
        {profile.experience ? (
          <>
            <Muted text={t.experienceLabel} />
            <Body text={profile.experience} />
          </>
        ) : null}
        {profile.certifications ? (
          <>
            <Muted text={t.certificationsTitle} />
            <Body text={profile.certifications} />
          </>
        ) : null}
        {!profile.profession && !profile.bio && !profile.experience && !profile.certifications ? (
          <Muted text={t.notGiven} />
        ) : null}
      </Section>
      {profile.contact ? (
        <Section title={t.contactTitle}>
          {(
            [
              [t.phone, profile.contact.phone],
              [t.email, profile.contact.email],
              [t.address, profile.contact.address],
            ] as const
          ).map(([label, value]) =>
            value ? (
              <View key={label} className="gap-0.5">
                <Muted text={label} />
                <Body text={value} />
              </View>
            ) : null,
          )}
        </Section>
      ) : null}
      <Section title={t.skillsTitle}>
        {profile.skills.length ? (
          <SkillChips skills={profile.skills} />
        ) : (
          <Muted text={profile.own ? t.noSkillsNudge : t.notGiven} />
        )}
      </Section>
      {study ? (
        <Section title={t.studyTitle}>
          <Body text={study} />
        </Section>
      ) : null}
      <Section title={t.ideasTitle}>
        <Muted text={t.ideasComingSoon} />
      </Section>
    </View>
  );
}

type TextField = "headline" | "bio" | "profession" | "experience" | "certifications";
const textFields: TextField[] = ["headline", "bio", "profession", "experience", "certifications"];

/** S12: edit your own profile. The verified name is shown but cannot be changed here. */
export function ProfileEditor({
  initial,
  api,
  onSaved,
}: {
  initial: Profile;
  api: ProfileApi;
  onSaved: () => void;
}) {
  const { t, language } = useLanguage();
  const [changes, setChanges] = useState<ProfileChanges>({
    headline: initial.headline,
    bio: initial.bio,
    profession: initial.profession,
    experience: initial.experience,
    certifications: initial.certifications,
    regionId: initial.regionId,
    districtId: initial.districtId,
    study: initial.study,
  });
  const [skills, setSkills] = useState(initial.skills);
  const [typed, setTyped] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [skillProblem, setSkillProblem] = useState<SkillProblem | null>(null);
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl);
  const [regions, setRegions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [tooLong, setTooLong] = useState<Partial<Record<TextField, boolean>>>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.regions(language).then(setRegions);
  }, [api, language]);
  useEffect(() => {
    if (changes.regionId) api.districts(changes.regionId, language).then(setDistricts);
  }, [api, language, changes.regionId]);

  const skillMessage: Record<SkillProblem, string> = {
    too_long: t.skillTooLong(MAX_SKILL_LENGTH),
    too_many: t.skillTooMany(MAX_SKILLS),
  };

  const update = (next: Partial<ProfileChanges>) => setChanges((c) => ({ ...c, ...next }));

  const onType = async (value: string) => {
    setTyped(value);
    setSkillProblem(null);
    setSuggestions(value.trim() ? await api.suggestSkills(value) : []);
  };

  const add = (value: string) => {
    const result = addSkill(skills, value);
    setSkills(result.skills);
    setSkillProblem(result.problem ?? null);
    if (!result.problem) {
      setTyped("");
      setSuggestions([]);
    }
  };

  const save = async () => {
    const over = Object.fromEntries(
      textFields.map((f) => [f, changes[f].length > profileLimits[f]]),
    ) as Record<TextField, boolean>;
    setTooLong(over);
    if (Object.values(over).some(Boolean)) return;
    setBusy(true);
    const [saved, skillsSaved] = await Promise.all([api.save(changes), api.setSkills(skills)]);
    setBusy(false);
    if (saved && skillsSaved === "done") return onSaved();
    if (skillsSaved === "too_many" || skillsSaved === "too_long") setSkillProblem(skillsSaved);
    setFailed(true);
  };

  const textField = (field: TextField, label: string, hint?: string, multiline?: boolean) => (
    <Field
      label={label}
      value={changes[field]}
      onChange={(value) => update({ [field]: value })}
      hint={hint}
      multiline={multiline}
      problem={tooLong[field] ? t.tooLongField(profileLimits[field]) : null}
    />
  );

  return (
    <View className="gap-4">
      <ScreenTitle>{t.editProfile}</ScreenTitle>
      <Section title={t.profilePhoto}>
        <View className="flex-row flex-wrap items-center gap-4">
          <Avatar name={initial.fullName} url={photoUrl} />
          <View className="flex-1 gap-2">
            <Muted text={t.profilePhotoHint} />
            <Button
              secondary
              label={photoUrl ? t.replacePhoto : t.choosePhoto}
              onPress={async () => {
                const url = await api.pickAndUploadPhoto().catch(() => null);
                if (url) setPhotoUrl(url);
              }}
            />
          </View>
        </View>
      </Section>
      <Section title={t.aboutTitle}>
        <Body text={initial.fullName} />
        <Muted text={t.nameLocked} />
        {textField("headline", t.headlineLabel, t.headlineHint)}
        {textField("profession", t.profession)}
        {textField("bio", t.bioLabel, undefined, true)}
        {textField("experience", t.experienceLabel, undefined, true)}
        {textField("certifications", t.certificationsLabel, t.certificationsHint)}
        <ChoiceList
          label={t.region}
          options={regions}
          value={changes.regionId ?? undefined}
          onChange={(regionId) => update({ regionId, districtId: null })}
        />
        <ChoiceList
          label={t.district}
          options={districts}
          value={changes.districtId ?? undefined}
          onChange={(districtId) => update({ districtId })}
          disabled={!changes.regionId}
        />
      </Section>
      <Section title={t.skillsTitle}>
        {skills.length ? (
          <SkillChips skills={skills} onRemove={(s) => setSkills(skills.filter((x) => x !== s))} />
        ) : (
          <Muted text={t.noSkillsNudge} />
        )}
        <Field
          label={t.skillsLabel}
          value={typed}
          onChange={onType}
          hint={t.skillsHint(MAX_SKILLS)}
          problem={skillProblem ? skillMessage[skillProblem] : null}
        />
        {suggestions.length ? (
          <View className="flex-row flex-wrap gap-2">
            {suggestions.map((s) => (
              <Pressable
                key={s}
                role="button"
                aria-label={s}
                onPress={() => add(s)}
                className="min-h-[40px] justify-center rounded-full border border-line px-3"
              >
                <Text className="font-figtree text-sm text-ink">{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Button secondary label={t.addSkill} onPress={() => add(typed)} />
      </Section>
      <Section title={t.studyTitle}>
        <Field
          label={t.studyInstitution}
          value={changes.study.institution}
          onChange={(institution) => update({ study: { ...changes.study, institution } })}
        />
        <Field
          label={t.studyCourse}
          value={changes.study.course}
          onChange={(course) => update({ study: { ...changes.study, course } })}
        />
        <Field
          label={t.studyYear}
          value={changes.study.year?.toString() ?? ""}
          keyboardType="number-pad"
          onChange={(year) =>
            update({
              study: { ...changes.study, year: /^\d{1,2}$/.test(year) ? Number(year) : null },
            })
          }
        />
      </Section>
      <LinkButton
        href="/settings/privacy"
        label={t.privacyLink}
        className="min-h-[44px] flex-row items-center justify-between rounded-card border border-line bg-surface px-4"
      >
        <Text className="font-figtree-semibold text-sm text-ink">{t.privacyLink}</Text>
        <Text aria-hidden className="font-figtree text-[15px] text-ink-2">
          ›
        </Text>
      </LinkButton>
      <Message text={failed ? t.profileSaveFailed : null} />
      <Button label={t.saveProfile} onPress={save} disabled={busy} />
    </View>
  );
}
