import { News } from "../../src/components/news";
import { memberNewsApi } from "../../src/lib/news";

export default function NewsScreen() {
  return <News api={memberNewsApi} />;
}
