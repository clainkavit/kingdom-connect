import { Text } from "react-native";
import { useLanguage } from "../lib/language";
import { reportHref, type ReportTarget } from "../lib/reports";
import { LinkButton } from "./link-button";

export function ReportLink({ target, memberId }: { target: ReportTarget; memberId: string }) {
  const { t } = useLanguage();
  return (
    <LinkButton
      href={reportHref(target, memberId)}
      label={t.reportAction}
      className="min-h-[40px] items-center justify-center rounded-[9px] border border-line px-4"
    >
      <Text className="font-figtree-semibold text-sm text-bad-text">{t.reportAction}</Text>
    </LinkButton>
  );
}
