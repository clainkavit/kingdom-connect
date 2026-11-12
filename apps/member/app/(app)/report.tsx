import { Redirect, useLocalSearchParams } from "expo-router";
import { ReportForm } from "../../src/components/reports";
import { connectionsApi } from "../../src/lib/connections";
import { memberReportsApi } from "../../src/lib/reports-api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ReportScreen() {
  const { type, id, member } = useLocalSearchParams<{
    type?: string;
    id?: string;
    member?: string;
  }>();
  if ((type !== "profile" && type !== "thread" && type !== "opportunity") || !UUID.test(id ?? ""))
    return <Redirect href="/" />;
  return (
    <ReportForm
      key={`${type}:${id}`}
      api={memberReportsApi}
      target={{ type, id: id! }}
      memberId={UUID.test(member ?? "") ? member! : null}
      connections={connectionsApi}
    />
  );
}
