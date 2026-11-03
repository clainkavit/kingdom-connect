import { MyDataScreen } from "../../../src/components/my-data";
import { useAuth } from "../../../src/lib/auth";
import { myDataApi } from "../../../src/lib/my-data";

export default function MyDataPage() {
  const { signOut } = useAuth();
  return <MyDataScreen api={myDataApi} onDeleted={() => void signOut()} />;
}
