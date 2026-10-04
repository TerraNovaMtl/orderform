import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
let content = await readFile(".env.local", "utf8");
function setIfMissing(key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const existing = content
    .match(pattern)?.[0]
    .slice(key.length + 1)
    .trim();
  if (existing && existing !== '""' && existing !== "''") return;
  content = pattern.test(content)
    ? content.replace(pattern, `${key}=${value}`)
    : `${content.trimEnd()}\n${key}=${value}\n`;
}
setIfMissing("AUTH_SECRET", randomBytes(32).toString("base64url"));
setIfMissing("ADMIN_EMAILS", "terranova.mtl.ai@gmail.com");
await writeFile(".env.local", content);
console.log(
  "Local auth secret and initial admin configured. Secret values were not displayed.",
);
