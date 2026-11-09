import { MyPosts } from "../../../src/components/my-posts";
import { opportunitiesApi } from "../../../src/lib/opportunities";

export default function MyPostsScreen() {
  return <MyPosts api={opportunitiesApi} />;
}
