import { useEffect, useState } from "react";
import type { OpportunityBrowseApi } from "./opportunity-browse";

/** O10: which posts the member has saved, with a toggle that shows at once and undoes itself if saving fails. */
export function useSavedPosts(api: Pick<OpportunityBrowseApi, "savedIds" | "setSaved">) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    api.savedIds().then(
      (list) => live && setIds(new Set(list)),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api]);

  const flip = (id: string, on: boolean) =>
    setIds((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggle = async (id: string) => {
    const on = !ids.has(id);
    flip(id, on);
    const ok = await api.setSaved(id, on).catch(() => false);
    if (!ok) flip(id, !on);
  };

  return { isSaved: (id: string) => ids.has(id), toggle, count: ids.size };
}
