import { DirectoryScreen } from "../../src/components/directory";
import { directoryApi } from "../../src/lib/directory";

export default function PeopleScreen() {
  return <DirectoryScreen api={directoryApi} />;
}
