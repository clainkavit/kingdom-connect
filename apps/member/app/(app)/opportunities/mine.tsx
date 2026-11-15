import { MyPosts } from "../../../src/components/my-posts";
import { opportunitiesApi } from "../../../src/lib/opportunities";
import { picksApi } from "../../../src/lib/picks";

export default function MyPostsScreen() {
  return <MyPosts api={opportunitiesApi} picks={picksApi} />;
}
