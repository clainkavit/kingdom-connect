"use client";

import {
  employmentTypes,
  formatDate,
  formatDateTime,
  parseSkills,
  type Language,
  type Strings,
} from "@kingdom-connect/shared";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/language";
import type { Option } from "@/lib/opportunities";
import type {
  ApproveInput,
  ApproveResult,
  ListingSource,
  PublicListing,
  PublicListingsApi,
  SourceKind,
} from "@/lib/public-listings";
import { cn } from "@/lib/utils";
import { Card, Notice, Row } from "./cards";
import { Field, Select } from "./field";
import { employmentText, OptionSelect } from "./opportunity-moderation";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";
import { buttonVariants } from "./ui/button";

const day = (date: string, language: Language) =>
  formatDate(new Date(`${date}T12:00:00Z`), language);

const checkboxClass = "size-4 accent-[var(--kc-blue)]";

function useLoad<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (loaded) => live && setValue(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [load, attempt]);
  const retry = () => {
    setFailed(false);
    setValue(null);
    setAttempt((a) => a + 1);
  };
  return { value, setValue, failed, retry };
}

function approveProblem(t: Strings, result: ApproveResult): string | null {
  return {
    ok: null,
    closing_date: t.plNeedClosing,
    place_and_sector: t.plNeedPlace,
    employment_type: t.plNeedEmployment,
    too_many_skills: t.postTooManySkills,
    already_decided: t.plAlreadyDecided,
    not_found: t.plAlreadyDecided,
    not_staff: t.decideFailed,
    failed: t.decideFailed,
  }[result];
}

function ListingReview({
  listing,
  api,
  onDone,
  onBack,
}: {
  listing: PublicListing;
  api: PublicListingsApi;
  onDone: (message: string, tone: "good" | "warn") => void;
  onBack: () => void;
}) {
  const { t, language } = useLanguage();
  const [options, setOptions] = useState<{ sectors: Option[]; regions: Option[] }>({
    sectors: [],
    regions: [],
  });
  const [districts, setDistricts] = useState<Option[]>([]);
  const [slots, setSlots] = useState<{ used: number; limit: number } | null>(null);
  const [skillsText, setSkillsText] = useState("");
  const [form, setForm] = useState<ApproveInput>({
    regionId: listing.suggestedRegionId ?? "",
    districtId: listing.suggestedDistrictId ?? "",
    remote: false,
    sectorId: listing.suggestedSectorId ?? "",
    skills: [],
    closingOn: listing.closingOn ?? "",
    employmentType: "",
    translatedTitle: listing.translatedTitle ?? "",
    translatedSummary: listing.translatedSummary ?? "",
    feeNote: listing.feeNote ?? "",
    feature: false,
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.options(language).then(setOptions, () => setProblem(t.plLoadFailed));
    api.slots().then(setSlots, () => setSlots(null));
  }, [api, language, t]);
  useEffect(() => {
    if (form.regionId) {
      api.districts(form.regionId, language).then(setDistricts, () => setDistricts([]));
    }
  }, [api, form.regionId, language]);

  const set = <K extends keyof ApproveInput>(key: K, value: ApproveInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const isJob = listing.kind === "jobs";
  const toSwahili = listing.language === "en";
  const slotsFull = slots !== null && slots.used >= slots.limit;

  const approve = async () => {
    setBusy(true);
    setProblem(null);
    const { result, featured } = await api
      .approve(listing.id, { ...form, skills: parseSkills(skillsText) })
      .catch(() => ({ result: "failed" as const, featured: null }));
    setBusy(false);
    if (result !== "ok") return setProblem(approveProblem(t, result));
    if (form.feature && featured !== "ok") onDone(t.plApprovedNotFeatured, "warn");
    else onDone(t.plApproved, "good");
  };

  const discard = async () => {
    setBusy(true);
    const done = await api.discard([listing.id]).catch(() => -1);
    setBusy(false);
    if (done < 0) return setProblem(t.plDiscardFailed);
    onDone(done === 1 ? t.plDiscarded(1) : t.plAlreadyDecided, done === 1 ? "good" : "warn");
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] text-sm font-semibold text-primary underline underline-offset-2"
        >
          {t.plBack}
        </button>
      </div>
      <Card title={listing.title}>
        <dl className="flex flex-col gap-2">
          <Row label={t.plFilterSource} value={listing.sourceName} />
          {listing.employer ? (
            <Row label={isJob ? t.plEmployer : t.plProcuringBody} value={listing.employer} />
          ) : null}
          {listing.summary ? <Row label={t.plSummary} value={listing.summary} /> : null}
          {listing.referenceNo ? <Row label={t.plReference} value={listing.referenceNo} /> : null}
          {listing.posts ? <Row label={t.plPosts} value={String(listing.posts)} /> : null}
          <Row
            label={t.plClosingDate}
            value={listing.closingOn ? day(listing.closingOn, language) : t.plNoClosing}
          />
        </dl>
        <div>
          <a
            href={listing.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            {t.plOpenNotice}
          </a>
        </div>
      </Card>
      <form
        className="flex flex-col gap-4 rounded-[22px] border bg-card px-6 py-6 shadow-card"
        onSubmit={(e) => e.preventDefault()}
      >
        <p className="text-sm text-ink-2">
          {listing.translatedTitle ? t.plTranslationHint : t.plNoTranslation}
        </p>
        <Field
          id="pl-title"
          label={toSwahili ? t.plTitleInSwahili : t.plTitleInEnglish}
          value={form.translatedTitle}
          onChange={(v) => set("translatedTitle", v)}
        />
        <Field
          id="pl-summary"
          label={toSwahili ? t.plSummaryInSwahili : t.plSummaryInEnglish}
          value={form.translatedSummary}
          onChange={(v) => set("translatedSummary", v)}
          multiline
        />
        <label className="flex min-h-[40px] items-center gap-3 text-sm font-semibold text-foreground">
          <input
            type="checkbox"
            checked={form.remote}
            onChange={(e) => set("remote", e.target.checked)}
            className={checkboxClass}
          />
          {t.fieldRemote}
        </label>
        {!form.remote ? (
          <div className="grid gap-4 min-[881px]:grid-cols-2">
            <OptionSelect
              id="pl-region"
              label={t.region}
              value={form.regionId}
              options={options.regions}
              onChange={(v) => setForm((f) => ({ ...f, regionId: v, districtId: "" }))}
            />
            <OptionSelect
              id="pl-district"
              label={t.district}
              value={form.districtId}
              options={form.regionId ? districts : []}
              onChange={(v) => set("districtId", v)}
            />
          </div>
        ) : null}
        <OptionSelect
          id="pl-sector"
          label={t.sector}
          value={form.sectorId}
          options={options.sectors}
          onChange={(v) => set("sectorId", v)}
        />
        {isJob ? (
          <OptionSelect
            id="pl-employment"
            label={t.fieldEmployment}
            value={form.employmentType}
            options={employmentTypes.map((k) => ({
              value: k,
              label: t[employmentText[k]] as string,
            }))}
            onChange={(v) => set("employmentType", v as ApproveInput["employmentType"])}
          />
        ) : null}
        <Field id="pl-skills" label={t.fieldSkills} value={skillsText} onChange={setSkillsText} />
        <Field
          id="pl-closing"
          label={t.plClosingDate}
          type="date"
          value={form.closingOn}
          onChange={(v) => set("closingOn", v)}
        />
        <div className="flex flex-col gap-1.5">
          <Field
            id="pl-fee"
            label={t.plFeeNote}
            value={form.feeNote}
            onChange={(v) => set("feeNote", v)}
          />
          <p className="text-sm text-ink-2">{t.plFeeNoteHint}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex min-h-[40px] items-center gap-3 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              checked={form.feature}
              disabled={slotsFull}
              onChange={(e) => set("feature", e.target.checked)}
              className={checkboxClass}
            />
            {t.plFeature}
          </label>
          {slots ? (
            <p className="text-sm text-ink-2">
              {slotsFull ? t.plSlotsFull : t.plSlots(slots.used, slots.limit)}
            </p>
          ) : null}
        </div>
        <Notice tone="bad" text={problem} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={approve}
            className={buttonVariants({ variant: "default" })}
          >
            {t.plApprove}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={discard}
            className={buttonVariants({ variant: "outline" })}
          >
            {t.plDiscard}
          </button>
        </div>
      </form>
    </div>
  );
}

function Queue({ api }: { api: PublicListingsApi }) {
  const { t, language } = useLanguage();
  const load = useMemo(() => () => api.waiting(), [api]);
  const { value: items, setValue: setItems, failed, retry } = useLoad(load);
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "warn" | "bad"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const sources = useMemo(
    () =>
      [...new Map((items ?? []).map((l) => [l.sourceId, l.sourceName])).entries()].map(
        ([value, label]) => ({ value, label }),
      ),
    [items],
  );
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return (items ?? []).filter(
      (l) =>
        (!source || l.sourceId === source) &&
        (!words ||
          l.title.toLowerCase().includes(words) ||
          (l.translatedTitle ?? "").toLowerCase().includes(words)),
    );
  }, [items, source, query]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const pageNow = Math.min(page, pages - 1);
  const paged = shown.slice(pageNow * pageSize, (pageNow + 1) * pageSize);

  const remove = (ids: string[]) => {
    setItems((list) => (list ?? []).filter((l) => !ids.includes(l.id)));
    setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
  };
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allShown = paged.length > 0 && paged.every((l) => selected.has(l.id));

  const approveSelected = async () => {
    const ids = [...selected];
    setBusy(true);
    const done = await api.approveMany(ids).catch(() => null);
    setBusy(false);
    if (!done) return setNotice({ tone: "bad", text: t.plApproveManyFailed });
    remove(done.approved);
    setNotice({
      tone: done.needsDetails ? "warn" : "good",
      text: t.plApprovedMany(done.approved.length, done.needsDetails),
    });
  };

  const discardSelected = async () => {
    const ids = [...selected];
    setBusy(true);
    const done = await api.discard(ids).catch(() => -1);
    setBusy(false);
    if (done < 0) return setNotice({ tone: "bad", text: t.plDiscardFailed });
    remove(ids);
    setNotice({ tone: "good", text: t.plDiscarded(done) });
  };

  const current = open ? items?.find((l) => l.id === open) : undefined;
  if (current) {
    return (
      <ListingReview
        listing={current}
        api={api}
        onBack={() => setOpen(null)}
        onDone={(text, tone) => {
          remove([current.id]);
          setOpen(null);
          setNotice({ tone, text });
        }}
      />
    );
  }

  if (failed) return <ErrorState message={t.plLoadFailed} onRetry={retry} />;
  if (!items) return <LoadingRows />;

  return (
    <div className="flex flex-col gap-4">
      <Notice tone={notice?.tone ?? "good"} text={notice?.text ?? null} />
      {items.length === 0 ? (
        <EmptyState title={t.plEmptyTitle} message={t.plEmptyMessage} />
      ) : (
        <>
          <div className="grid gap-3 min-[881px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Select
              id="pl-source"
              label={t.plFilterSource}
              value={source}
              onChange={(value) => {
                setSource(value);
                setPage(0);
              }}
              options={[{ value: "", label: t.plAllSources }, ...sources]}
            />
            <Field
              id="pl-search"
              label={t.plSearch}
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(0);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-[44px] items-center gap-3 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={allShown}
                onChange={(e) => paged.forEach((l) => toggle(l.id, e.target.checked))}
                className={checkboxClass}
              />
              {t.plSelectAll}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={approveSelected}
                className={buttonVariants()}
              >
                {t.plApproveSelected(selected.size)}
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={discardSelected}
                className={buttonVariants({ variant: "outline" })}
              >
                {t.plDiscardSelected(selected.size)}
              </button>
            </div>
          </div>
          <p className="text-[13px] text-ink-2">{t.plApproveHint}</p>
          {shown.length === 0 ? (
            <p className="text-sm text-ink-2">{t.plNoMatch}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-[22px] border bg-card shadow-card">
              {paged.map((l) => (
                <li key={l.id} className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={t.plSelect(l.title)}
                    checked={selected.has(l.id)}
                    onChange={(e) => toggle(l.id, e.target.checked)}
                    className={cn(checkboxClass, "mt-3 shrink-0")}
                  />
                  <button
                    type="button"
                    onClick={() => setOpen(l.id)}
                    className="flex min-h-[44px] min-w-0 flex-1 flex-col items-start gap-1 text-left"
                  >
                    <span className="text-[15px] font-semibold break-words text-foreground">
                      {l.title}
                    </span>
                    {l.translatedTitle ? (
                      <span className="text-sm break-words text-ink-2">{l.translatedTitle}</span>
                    ) : null}
                    <span className="text-[13px] text-ink-2">
                      {[
                        l.sourceName,
                        l.employer,
                        l.closingOn ? t.plCloses(day(l.closingOn, language)) : t.plNoClosing,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {shown.length > 0 ? (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-[120px]">
                <Select
                  id="pl-page-size"
                  label={t.plPageSize}
                  value={String(pageSize)}
                  onChange={(value) => {
                    setPageSize(Number(value));
                    setPage(0);
                  }}
                  options={[10, 20, 50].map((n) => ({ value: String(n), label: String(n) }))}
                />
              </div>
              <nav aria-label={t.plPage(pageNow + 1, pages)} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pageNow === 0}
                  onClick={() => setPage(pageNow - 1)}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {t.plPrevious}
                </button>
                <span className="px-2 text-sm font-semibold text-foreground">
                  {t.plPage(pageNow + 1, pages)}
                </span>
                <button
                  type="button"
                  disabled={pageNow >= pages - 1}
                  onClick={() => setPage(pageNow + 1)}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {t.plNext}
                </button>
              </nav>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function SourceCard({ source, api }: { source: ListingSource; api: PublicListingsApi }) {
  const { t, language } = useLanguage();
  const [active, setActive] = useState(source.active);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    setBusy(true);
    setProblem(null);
    const result = await api.setActive(source.id, !active).catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") setActive(!active);
    else setProblem(t.plSwitchFailed);
  };

  const status = !source.readerReady ? t.plSourceWaitingDev : active ? t.plSourceOn : t.plSourceOff;

  return (
    <Card title={source.name}>
      <dl className="flex flex-col gap-2">
        <Row
          label={t.plKind}
          value={source.kind === "tenders" ? t.plSourceTenders : t.plSourceJobs}
        />
        <Row
          label={t.plAddress}
          value={
            <a
              href={source.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {source.pageUrl}
            </a>
          }
        />
        <Row label={t.plStatus} value={status} />
        <Row
          label={t.plLastRunLabel}
          value={
            source.lastRunAt
              ? t.plLastRun(formatDateTime(source.lastRunAt, language), source.lastFound ?? 0)
              : t.plNeverRun
          }
        />
      </dl>
      <Notice tone="bad" text={source.lastError ? t.plLastError(source.lastError) : null} />
      <Notice tone="bad" text={problem} />
      {source.readerReady ? (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={flip}
            className={buttonVariants({ variant: "outline" })}
          >
            {active ? t.plSwitchOff : t.plSwitchOn}
          </button>
        </div>
      ) : null}
    </Card>
  );
}

function AddCompany({ api, onAdded }: { api: PublicListingsApi; onAdded: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [kind, setKind] = useState<SourceKind>("jobs");
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim() || !/^https:\/\/\S+\.\S+$/.test(pageUrl.trim()))
      return setMessage({ tone: "bad", text: t.plAddInvalid });
    setBusy(true);
    const result = await api.addSource({ name, pageUrl, kind }).catch(() => "failed" as const);
    setBusy(false);
    if (result === "ok") {
      setName("");
      setPageUrl("");
      setMessage({ tone: "good", text: t.plAdded });
      return onAdded();
    }
    setMessage({
      tone: "bad",
      text:
        result === "invalid" ? t.plAddInvalid : result === "exists" ? t.plAddExists : t.plAddFailed,
    });
  };

  return (
    <Card title={t.plAddTitle}>
      <p className="text-sm text-ink-2">{t.plAddHint}</p>
      <div className="grid gap-3 min-[881px]:grid-cols-3">
        <Field id="pl-company" label={t.plCompanyName} value={name} onChange={setName} />
        <Field id="pl-page" label={t.plCareersPage} value={pageUrl} onChange={setPageUrl} />
        <Select
          id="pl-kind"
          label={t.plKind}
          value={kind}
          onChange={(v) => setKind(v as SourceKind)}
          options={[
            { value: "jobs", label: t.plSourceJobs },
            { value: "tenders", label: t.plSourceTenders },
          ]}
        />
      </div>
      <Notice tone={message?.tone ?? "good"} text={message?.text ?? null} />
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={add}
          className={buttonVariants({ variant: "outline" })}
        >
          {t.plAdd}
        </button>
      </div>
    </Card>
  );
}

function Sources({ api }: { api: PublicListingsApi }) {
  const { t } = useLanguage();
  const load = useMemo(() => () => api.sources(), [api]);
  const { value: sources, failed, retry } = useLoad(load);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">{t.plSourcesIntro}</p>
      {failed ? (
        <ErrorState message={t.plSourcesLoadFailed} onRetry={retry} />
      ) : !sources ? (
        <LoadingRows />
      ) : (
        <div className="grid gap-4 min-[1200px]:grid-cols-2">
          {sources.map((s) => (
            <SourceCard key={s.id} source={s} api={api} />
          ))}
        </div>
      )}
      <AddCompany api={api} onAdded={retry} />
    </div>
  );
}

/** O20: public listings waiting for staff review (O19), and the sources they come from. */
export function PublicListingsScreen({ api }: { api: PublicListingsApi }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"waiting" | "sources">("waiting");
  const tabs = [
    { key: "waiting", label: t.plTabWaiting },
    { key: "sources", label: t.plTabSources },
  ] as const;
  return (
    <>
      <ScreenTitle>{t.adminNavPublicListings}</ScreenTitle>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">{t.plIntro}</p>
        <div role="tablist" aria-label={t.adminNavPublicListings} className="flex gap-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "min-h-[44px] rounded-full border px-5 text-sm font-semibold text-foreground",
                tab === item.key && "border-primary bg-blue-soft text-primary",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "waiting" ? <Queue api={api} /> : <Sources api={api} />}
      </div>
    </>
  );
}
