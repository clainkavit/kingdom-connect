import { checkMaterialLink, MATERIAL_MAX_BYTES, videoEmbedUrl } from "@kingdom-connect/shared";
import { createElement, useState } from "react";
import { Linking, Platform, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { Material, MaterialsApi } from "../lib/materials";
import { useLoad } from "./events";
import { Button, Field, Message } from "./form";
import { ErrorState, LoadingRows } from "./states";

/** A PDF or video shown inside the platform. On the web it is an embedded frame; elsewhere it opens. */
function Viewer({ src, title }: { src: string; title: string }) {
  if (Platform.OS !== "web") {
    void Linking.openURL(src);
    return null;
  }
  return createElement("iframe", {
    src,
    title,
    allow: "fullscreen",
    style: { width: "100%", height: 560, border: 0, borderRadius: 12, background: "#fff" },
  });
}

function MaterialRow({
  material,
  api,
  downloads,
  canManage,
  onRemoved,
}: {
  material: Material;
  api: MaterialsApi;
  downloads: boolean;
  canManage: boolean;
  onRemoved: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const embed = material.url ? videoEmbedUrl(material.url) : null;
  const kindLabel =
    material.kind === "file" ? t.materialsPdf : embed ? t.materialsVideo : t.materialsLink;

  const view = async () => {
    setProblem(null);
    if (open) return setOpen(null);
    if (material.kind === "link") {
      if (embed) return setOpen(embed);
      return void Linking.openURL(material.url!);
    }
    const url = await api.fileUrl(material.storagePath!, false).catch(() => null);
    // The browser's PDF toolbar offers saving; hide it when the poster turned downloads off.
    if (url) setOpen(downloads ? url : `${url}#toolbar=0`);
    else setProblem(t.materialsFailed);
  };

  const download = async () => {
    const url = await api.fileUrl(material.storagePath!, true).catch(() => null);
    if (url) void Linking.openURL(url);
    else setProblem(t.materialsFailed);
  };

  const remove = async () => {
    const result = await api.remove(material).catch(() => "error");
    if (result === "ok") onRemoved();
    else setProblem(t.materialsFailed);
  };

  return (
    <View className="gap-2 px-4 py-3">
      <View className="gap-0.5">
        <Text className="font-figtree-semibold text-[15px] text-ink">{material.title}</Text>
        <Text className="font-figtree text-[13px] text-ink-2">{kindLabel}</Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button
          secondary
          label={
            open
              ? t.materialsClose
              : material.kind === "link" && !embed
                ? t.materialsOpenLink
                : t.materialsOpen
          }
          onPress={view}
        />
        {material.kind === "file" && (downloads || canManage) ? (
          <Button secondary label={t.materialsDownload} onPress={download} />
        ) : null}
        {canManage ? <Button secondary label={t.materialsRemove} onPress={remove} /> : null}
      </View>
      <Message text={problem} />
      {open ? <Viewer src={open} title={material.title} /> : null}
    </View>
  );
}

function AddMaterial({
  api,
  trainingId,
  onAdded,
}: {
  api: MaterialsApi;
  trainingId: string;
  onAdded: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = (result: string) => {
    if (result === "ok") {
      setTitle("");
      setUrl("");
      onAdded();
    } else {
      setProblem(
        result === "invalid_title" || result === "contact_details"
          ? t.materialsProblemTitle
          : result === "invalid_url"
            ? t.materialsProblemUrl
            : result === "file_too_big" || result === "invalid_file"
              ? t.materialsProblemFile
              : t.materialsFailed,
      );
    }
    setBusy(false);
  };

  const addLink = async () => {
    const local = checkMaterialLink(title, url);
    if (local)
      return setProblem(local === "title" ? t.materialsProblemTitle : t.materialsProblemUrl);
    setBusy(true);
    setProblem(null);
    finish(await api.addLink(trainingId, title.trim(), url.trim()).catch(() => "error"));
  };

  const addPdf = async () => {
    if (title.trim().length < 2 || title.trim().length > 120) {
      return setProblem(t.materialsProblemTitle);
    }
    setProblem(null);
    const file = await api.pickPdf().catch(() => null);
    if (!file) return;
    if (file.mime !== "application/pdf" || file.size < 1 || file.size > MATERIAL_MAX_BYTES) {
      return setProblem(t.materialsProblemFile);
    }
    setBusy(true);
    finish(await api.addFile(trainingId, title.trim(), file).catch(() => "error"));
  };

  return (
    <View className="gap-3 rounded-card border border-line bg-surface p-4">
      <Field label={t.materialsTitleLabel} value={title} onChange={setTitle} />
      <Field label={t.materialsUrlLabel} hint={t.materialsUrlHint} value={url} onChange={setUrl} />
      <Message text={problem} />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={busy ? t.materialsAdding : t.materialsAddLink}
          disabled={busy}
          onPress={addLink}
        />
        <Button secondary label={t.materialsAddPdf} disabled={busy} onPress={addPdf} />
      </View>
    </View>
  );
}

/**
 * S36: a training's learning materials. Only members registered for it, its poster and staff can open them;
 * the server enforces this (T02). Downloads appear only when the poster allowed them.
 */
export function Materials({
  api,
  trainingId,
  canOpen,
  downloadsAllowed,
}: {
  api: MaterialsApi;
  trainingId: string;
  canOpen: boolean;
  downloadsAllowed: boolean;
}) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const loaded = useLoad(
    () =>
      canOpen
        ? Promise.all([api.list(trainingId), api.canManage(trainingId)]).then(
            ([items, canManage]) => ({ items, canManage }),
          )
        : Promise.resolve({ items: [] as Material[], canManage: false }),
    attempt,
  );
  const reload = () => setAttempt((a) => a + 1);

  return (
    <View className="gap-2">
      <Text role="heading" aria-level={2} className="font-figtree-bold text-[17px] text-ink">
        {t.materialsTitle}
      </Text>
      {!canOpen ? (
        <Text className="font-figtree text-sm text-ink-2">{t.materialsLocked}</Text>
      ) : loaded.state === "failed" ? (
        <ErrorState message={t.materialsLoadFailed} onRetry={reload} />
      ) : loaded.state === "loading" ? (
        <LoadingRows rows={2} />
      ) : (
        <>
          {!downloadsAllowed && !loaded.value.canManage && loaded.value.items.length > 0 ? (
            <Text className="font-figtree text-[13px] text-ink-2">{t.materialsDownloadsOff}</Text>
          ) : null}
          {loaded.value.items.length === 0 ? (
            <Text className="font-figtree text-sm text-ink-2">{t.materialsEmpty}</Text>
          ) : (
            <View className="rounded-card border border-line bg-surface">
              {loaded.value.items.map((m, i) => (
                <View key={m.id} className={i > 0 ? "border-t border-line" : ""}>
                  <MaterialRow
                    material={m}
                    api={api}
                    downloads={downloadsAllowed}
                    canManage={loaded.value.canManage}
                    onRemoved={reload}
                  />
                </View>
              ))}
            </View>
          )}
          {loaded.value.canManage ? (
            <AddMaterial api={api} trainingId={trainingId} onAdded={reload} />
          ) : null}
        </>
      )}
    </View>
  );
}
