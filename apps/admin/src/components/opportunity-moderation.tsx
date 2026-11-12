"use client";

import {
  employmentTypes,
  formatDate,
  opportunityProblem,
  opportunityTypes,
  parseSkills,
  tanzaniaDate,
  type OpportunityInput,
  type OpportunityResult,
  type Strings,
  type TextKey,
} from "@kingdom-connect/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";
import type {
  ModerationAction,
  OpportunityModerationApi,
  Option,
  PendingPost,
  PostDetail,
  PostReason,
} from "@/lib/opportunities";
import { Card, Notice, Row } from "./cards";
import { Field } from "./field";
import { ScreenTitle } from "./screens";
import { ErrorState, LoadingRows } from "./states";
import { buttonVariants } from "./ui/button";

export const typeText: Record<PostDetail["type"], TextKey> = {
  job: "typeJob",
  partnership: "typePartnership",
  collaboration: "typeCollaboration",
  investment: "typeInvestment",
  tender: "typeTender",
};

const employmentText: Record<(typeof employmentTypes)[number], TextKey> = {
  full_time: "empFullTime",
  part_time: "empPartTime",
  contract: "empContract",
  internship: "empInternship",
};

const NEW_POSTER_REVIEWS = 3;

const posterLine = (t: Strings, post: { posterName: string | null; approvedPosts: number }) =>
  post.posterName === null
    ? t.postedByAdmin
    : post.approvedPosts < NEW_POSTER_REVIEWS
      ? `${post.posterName} · ${t.moderationNewPoster(post.approvedPosts)}`
      : post.posterName;

/** A04: opportunities waiting for review, at the top of the moderation queue (O01). */
export function OpportunityQueue({ api }: { api: OpportunityModerationApi }) {
  const { t, language } = useLanguage();
  const [state, setState] = useState<"loading" | "failed" | PendingPost[]>("loading");
  const load = useCallback(() => {
    api.pending().then(setState, () => setState("failed"));
  }, [api]);
  useEffect(load, [load]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-foreground">
        {Array.isArray(state) ? t.moderationPostsHeading(state.length) : t.moderationPostsTitle}
      </h2>
      {state === "failed" ? (
        <ErrorState message={t.moderationLoadFailed} onRetry={load} />
      ) : state === "loading" ? (
        <LoadingRows rows={1} />
      ) : state.length === 0 ? (
        <p className="text-sm text-ink-2">{t.moderationPostsEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {state.map((post) => (
            <li key={post.id}>
              <Link
                href={`/moderation/${post.id}`}
                className="flex flex-col gap-0.5 rounded-lg border bg-card p-3 shadow-card hover:bg-muted"
              >
                <span className="font-semibold text-foreground">{post.title}</span>
                <span className="text-sm text-ink-2">
                  {t[typeText[post.type]] as string} · {posterLine(t, post)} ·{" "}
                  {formatDate(post.submittedAt, language)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const outcomeText: Record<ModerationAction, TextKey> = {
  approve: "moderationApproved",
  reject: "moderationSentBack",
  remove: "moderationRemoved",
};

/** A05: one post with Approve, Send back or Remove, each refusal with a reason the poster sees (O01). */
export function PostReview({ api, id }: { api: OpportunityModerationApi; id: string }) {
  const { t, language } = useLanguage();
  const [post, setPost] = useState<PostDetail | null | "loading" | "failed">("loading");
  const [refusing, setRefusing] = useState<"reject" | "remove" | null>(null);
  const [reasons, setReasons] = useState<PostReason[]>([]);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<ModerationAction | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.load(id, language).then(setPost, () => setPost("failed"));
  }, [api, id, language]);
  useEffect(load, [load]);
  useEffect(() => {
    if (refusing) api.reasons(language).then(setReasons, () => setProblem(t.decideFailed));
  }, [refusing, api, language, t]);

  if (post === "failed") return <ErrorState message={t.moderationLoadFailed} onRetry={load} />;
  if (post === "loading") return <LoadingRows />;
  if (post === null) return <Notice tone="bad" text={t.moderationNotFound} />;

  const chosen = reasons.find((r) => r.code === code);
  const act = async (action: ModerationAction) => {
    if (action !== "approve" && (!chosen || (chosen.needsNote && !note.trim()))) {
      return setProblem(t.reasonRequired);
    }
    setBusy(true);
    setProblem(null);
    const result = await api
      .moderate(
        post.id,
        action,
        action === "approve" ? null : code,
        action === "approve" ? "" : note,
      )
      .catch(() => "failed");
    setBusy(false);
    if (result === "ok") return setDone(action);
    setProblem(result === "note_has_contact_details" ? t.postHasContact : t.decideFailed);
  };
  const location = post.remote
    ? t.remoteWork
    : [post.region, post.district].filter(Boolean).join(", ");
  const back = (
    <Link href="/moderation" className="text-sm font-semibold text-primary">
      {t.moderationBackToQueue}
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>{t.postReviewTitle}</ScreenTitle>
      {back}
      <Card title={post.title}>
        <Row label={t.fieldType} value={t[typeText[post.type]] as string} />
        {post.role ? <Row label={t.fieldRole} value={post.role} /> : null}
        {post.employmentType ? (
          <Row label={t.fieldEmployment} value={t[employmentText[post.employmentType]] as string} />
        ) : null}
        <Row label={t.postLocation} value={location} />
        <Row label={t.businessSector} value={post.sector} />
        <Row
          label={t.fieldClosing}
          value={formatDate(new Date(`${post.closingOn}T12:00:00+03:00`), language)}
        />
        {post.skills.length > 0 ? (
          <Row label={t.fieldSkills} value={post.skills.join(", ")} />
        ) : null}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{t.fieldDescription}</span>
          <p className="whitespace-pre-wrap text-sm text-foreground">{post.description}</p>
        </div>
        <p className="text-sm text-ink-2">
          {post.posterName === null ? t.postedByAdmin : t.postedBy(post.posterName)}
        </p>
        {post.posterName !== null && post.approvedPosts < NEW_POSTER_REVIEWS ? (
          <p className="text-sm text-ink-2">{t.moderationNewPoster(post.approvedPosts)}</p>
        ) : null}
      </Card>
      {done ? (
        <Notice tone="good" text={t[outcomeText[done]] as string} />
      ) : refusing ? (
        <Card title={refusing === "reject" ? t.moderationSendBack : t.moderationRemove}>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-foreground">{t.rejectReason}</legend>
            {reasons.map((reason) => (
              <label key={reason.code} className="flex min-h-[40px] items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="post-reason"
                  value={reason.code}
                  checked={code === reason.code}
                  onChange={() => setCode(reason.code)}
                  className="size-4 accent-[var(--kc-blue)]"
                />
                {reason.label}
              </label>
            ))}
          </fieldset>
          <Field
            id="post-note"
            label={chosen?.needsNote ? t.moderationPostNoteNeeded : t.moderationPostNote}
            value={note}
            onChange={setNote}
            multiline
          />
          <Notice tone="bad" text={problem} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => act(refusing)}
              className={buttonVariants({ variant: "destructive" })}
            >
              {refusing === "reject" ? t.moderationSendBackSend : t.moderationRemoveSend}
            </button>
            <button
              type="button"
              onClick={() => {
                setRefusing(null);
                setProblem(null);
              }}
              className={buttonVariants({ variant: "ghost" })}
            >
              {t.cancel}
            </button>
          </div>
        </Card>
      ) : (
        <>
          <Notice tone="bad" text={problem} />
          <div className="flex flex-wrap gap-2">
            {post.status === "pending_review" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act("approve")}
                  className={buttonVariants({ variant: "default" })}
                >
                  {t.approve}
                </button>
                <button
                  type="button"
                  onClick={() => setRefusing("reject")}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {t.moderationSendBack}
                </button>
              </>
            ) : null}
            {["pending_review", "published", "hidden", "closed"].includes(post.status) ? (
              <button
                type="button"
                onClick={() => setRefusing("remove")}
                className={buttonVariants({ variant: "outline" })}
              >
                {t.moderationRemove}
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

const resultText: Partial<Record<OpportunityResult, TextKey>> = {
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
  contact_details: "postHasContact",
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

const selectClass =
  "min-h-[44px] rounded-[9px] border border-field bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Select({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        <option value="">{t.choose}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A15: an administrator posts an opportunity. It publishes at once, with no no-fee tick (O01). */
export function AdminPostForm({ api }: { api: OpportunityModerationApi }) {
  const { t, language } = useLanguage();
  const [form, setForm] = useState<OpportunityInput>(emptyPost);
  const [skillsText, setSkillsText] = useState("");
  const [options, setOptions] = useState<{ sectors: Option[]; regions: Option[] }>({
    sectors: [],
    regions: [],
  });
  const [districts, setDistricts] = useState<Option[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.options(language).then(setOptions, () => setProblem(t.moderationLoadFailed));
  }, [api, language, t]);
  useEffect(() => {
    if (form.regionId) {
      api.districts(form.regionId, language).then(setDistricts, () => setDistricts([]));
    }
  }, [api, form.regionId, language]);

  const set = <K extends keyof OpportunityInput>(key: K, value: OpportunityInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const publish = async () => {
    const input = { ...form, skills: parseSkills(skillsText) };
    const local = opportunityProblem(input, { staff: true, today: tanzaniaDate() });
    if (local) return setProblem(t[resultText[local] ?? "postFailed"] as string);
    setBusy(true);
    setProblem(null);
    const result = await api.post(input).catch(() => "failed");
    setBusy(false);
    if (result === "ok") {
      setDone(true);
      setForm(emptyPost);
      setSkillsText("");
      return;
    }
    setProblem(t[resultText[result as OpportunityResult] ?? "postFailed"] as string);
  };

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>{t.adminNavPost}</ScreenTitle>
      <p className="text-sm text-ink-2">{t.adminPostIntro}</p>
      <Notice tone="good" text={done ? t.adminPostPublished : null} />
      <form
        className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-card"
        onSubmit={(e) => e.preventDefault()}
      >
        <Select
          id="post-type"
          label={t.fieldType}
          value={form.type}
          options={opportunityTypes.map((k) => ({ value: k, label: t[typeText[k]] as string }))}
          onChange={(v) =>
            setForm((f) => ({
              ...f,
              type: v as OpportunityInput["type"],
              employmentType: v === "job" ? f.employmentType : "",
            }))
          }
        />
        <Field
          id="post-title"
          label={t.fieldPostTitle}
          value={form.title}
          onChange={(v) => set("title", v)}
        />
        <Field
          id="post-role"
          label={t.fieldRole}
          value={form.role}
          onChange={(v) => set("role", v)}
        />
        {form.type === "job" ? (
          <Select
            id="post-employment"
            label={t.fieldEmployment}
            value={form.employmentType}
            options={employmentTypes.map((k) => ({
              value: k,
              label: t[employmentText[k]] as string,
            }))}
            onChange={(v) => set("employmentType", v as OpportunityInput["employmentType"])}
          />
        ) : null}
        <label className="flex min-h-[40px] items-center gap-3 text-sm font-semibold text-foreground">
          <input
            type="checkbox"
            checked={form.remote}
            onChange={(e) => set("remote", e.target.checked)}
            className="size-4 accent-[var(--kc-blue)]"
          />
          {t.fieldRemote}
        </label>
        {!form.remote ? (
          <>
            <Select
              id="post-region"
              label={t.region}
              value={form.regionId}
              options={options.regions}
              onChange={(v) => {
                setDistricts([]);
                setForm((f) => ({ ...f, regionId: v, districtId: "" }));
              }}
            />
            <Select
              id="post-district"
              label={t.district}
              value={form.districtId}
              options={districts}
              onChange={(v) => set("districtId", v)}
            />
          </>
        ) : null}
        <Select
          id="post-sector"
          label={t.businessSector}
          value={form.sectorId}
          options={options.sectors}
          onChange={(v) => set("sectorId", v)}
        />
        <Field
          id="post-description"
          label={t.fieldDescription}
          value={form.description}
          onChange={(v) => set("description", v)}
          multiline
        />
        <Field
          id="post-closing"
          label={t.fieldClosing}
          type="date"
          value={form.closingOn}
          onChange={(v) => set("closingOn", v)}
        />
        <Field id="post-skills" label={t.fieldSkills} value={skillsText} onChange={setSkillsText} />
        <p className="text-xs text-ink-2">{t.postSkillsHint}</p>
        <Notice tone="bad" text={problem} />
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={publish}
            className={buttonVariants({ variant: "default" })}
          >
            {t.adminEventPublish}
          </button>
        </div>
      </form>
    </div>
  );
}
