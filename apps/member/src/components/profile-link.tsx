import { CircleUser } from "lucide-react-native";
import { useLanguage } from "../lib/language";
import { LinkButton } from "./link-button";

export function ProfileLink({ color }: { color: string }) {
  const { t } = useLanguage();
  return (
    <LinkButton
      href="/profile"
      label={t.myProfile}
      className="h-11 w-11 items-center justify-center rounded-xl"
    >
      <CircleUser size={22} color={color} aria-hidden />
    </LinkButton>
  );
}
