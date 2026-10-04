// Read-only snapshot of the workbook configured in the legacy backend.
// Uses the existing clasp OAuth profile; credentials never enter logs or exports.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const backend = await readFile("google-apps-script.js", "utf8");
const spreadsheetId = backend.match(
  /const\s+SPREADSHEET_ID\s*=\s*'([^']+)'/,
)?.[1];
if (!spreadsheetId) throw new Error("Legacy spreadsheet ID was not found");
const config = JSON.parse(
  await readFile(join(homedir(), ".clasprc.json"), "utf8"),
);
const credentials = config.tokens?.default;
if (!credentials) throw new Error("No existing default clasp OAuth profile");
const url = new URL(
  `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
);
for (const name of ["Products", "Vendors", "Orders", "Counter"])
  url.searchParams.append("ranges", name);
url.searchParams.set("includeGridData", "true");
url.searchParams.set(
  "fields",
  "spreadsheetId,properties(title,timeZone),sheets(properties(title),data(rowData(values(effectiveValue,formattedValue,effectiveFormat(numberFormat)))))",
);
let accessToken = credentials.access_token;
async function get() {
  return fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });
}
let response = await get();
if (response.status === 401) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
    }),
  });
  if (!tokenResponse.ok) {
    console.error(
      "Existing Google connection needs reauthorization. HTTP",
      tokenResponse.status,
    );
    process.exit(2);
  }
  accessToken = (await tokenResponse.json()).access_token;
  response = await get();
}
if (!response.ok) {
  const result = await response.json();
  const serviceDisabled = result.error?.details?.some(
    (x) => x.reason === "SERVICE_DISABLED",
  );
  if (serviceDisabled) {
    const driveUrl = new URL(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/export`,
    );
    driveUrl.searchParams.set(
      "mimeType",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const drive = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30000),
    });
    if (drive.ok) {
      await mkdir("migration-data", { recursive: true });
      const path = `migration-data/google-sheet-${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`;
      const bytes = Buffer.from(await drive.arrayBuffer());
      await writeFile(path, bytes);
      console.log(
        JSON.stringify(
          {
            snapshot: path,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            format: "xlsx",
          },
          null,
          2,
        ),
      );
      process.exit(0);
    }
    const failure = await drive.json();
    console.error(
      "Read-only Drive export unavailable:",
      drive.status,
      failure.error?.errors?.map((x) => x.reason).join(",") ||
        failure.error?.status ||
        "unknown",
    );
  }
  console.error(
    "Read-only Sheets export unavailable:",
    response.status,
    result.error?.status || "unknown",
    result.error?.details
      ?.map((x) => x.reason)
      .filter(Boolean)
      .join(",") || "",
  );
  process.exit(2);
}
const raw = await response.json();
await mkdir("migration-data", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const path = `migration-data/google-sheet-${stamp}.json`;
await writeFile(path, JSON.stringify(raw, null, 2));
console.log(
  JSON.stringify(
    {
      snapshot: path,
      sha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
      timeZone: raw.properties?.timeZone,
      sheets: raw.sheets.map((s) => ({
        name: s.properties.title,
        rows: s.data?.[0]?.rowData?.length || 0,
      })),
    },
    null,
    2,
  ),
);
