import { MoreList, ScreenTitle } from "../src/components/screens";
import { strings } from "../src/strings";

export default function MoreScreen() {
  return (
    <>
      <ScreenTitle>{strings.more}</ScreenTitle>
      <MoreList />
    </>
  );
}
