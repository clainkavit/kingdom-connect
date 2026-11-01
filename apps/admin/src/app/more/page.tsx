import { LogOutButton } from "@/components/log-out-button";
import { MoreList, ScreenTitle } from "@/components/screens";
import { strings } from "@/strings";

export default function MorePage() {
  return (
    <>
      <ScreenTitle>{strings.more}</ScreenTitle>
      <MoreList />
      <LogOutButton />
    </>
  );
}
