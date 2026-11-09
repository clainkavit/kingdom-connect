import { platformName, serviceClient, sql } from "../_shared/db.ts";
import { corsHeaders, isUuid, json, requireUser } from "../_shared/http.ts";
import { stampLine } from "./stamp-line.ts";
import { stampFile } from "./stamp.ts";

// I05: an idea file, stamped with the viewer's name and date. Access is checked and the download logged in
// private.open_idea_file(); the original never leaves the server.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "not_signed_in" }, 401);

  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.fileId)) return json({ error: "not_found" }, 404);

  const [file] = await sql`select * from private.open_idea_file(${user.userId}, ${body.fileId})`;
  if (!file) return json({ error: "not_found" }, 404);

  const { data, error } = await serviceClient.storage
    .from("idea-files")
    .download(file.storage_path);
  if (error || !data) return json({ error: "not_found" }, 404);

  const line = stampLine(file.viewer_name, new Date(), await platformName());
  const stamped = await stampFile(new Uint8Array(await data.arrayBuffer()), file.mime, line);
  const name =
    String(file.file_name)
      .replace(/\.[a-z]+$/i, "")
      .replace(/[^\w .-]/g, "_") + ".pdf";
  return new Response(new Blob([stamped as Uint8Array<ArrayBuffer>]), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
});
