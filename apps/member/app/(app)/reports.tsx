import { MyReports } from "../../src/components/reports";
import { memberReportsApi } from "../../src/lib/reports-api";

export default function MyReportsScreen() {
  return <MyReports api={memberReportsApi} />;
}
