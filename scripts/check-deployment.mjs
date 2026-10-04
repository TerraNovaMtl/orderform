import assert from "node:assert/strict";
const base = process.argv[2];
if (!base?.startsWith("https://"))
  throw new Error("Pass the deployed HTTPS origin");
for (const [path, status, text] of [
  ["/", 200, "Please contact your vendor for access."],
  ["/admin", 200, "Continue with Google"],
  ["/api/admin", 401, "Admin sign-in required"],
  ["/api/catalog?vendor=NOT-A-REAL-AGENT", 404, "Not found"],
]) {
  const res = await fetch(new URL(path, base));
  const body = await res.text();
  assert.equal(res.status, status, `${path}: unexpected HTTP status`);
  assert.ok(body.includes(text), `${path}: expected content missing`);
  console.log(`${path}: HTTP ${res.status}, expected content verified`);
}
const csrfResponse = await fetch(new URL("/api/auth/csrf", base));
const { csrfToken } = await csrfResponse.json();
const cookies = csrfResponse.headers
  .getSetCookie()
  .map((x) => x.split(";")[0])
  .join("; ");
const res = await fetch(new URL("/api/auth/signin/google", base), {
  method: "POST",
  redirect: "manual",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Auth-Return-Redirect": "1",
    cookie: cookies,
    origin: base,
  },
  body: new URLSearchParams({
    csrfToken,
    callbackUrl: new URL("/admin", base).href,
  }),
});
const auth = await res.json();
const url = new URL(auth.url);
assert.equal(
  url.hostname,
  "accounts.google.com",
  "OAuth initiation did not reach Google",
);
console.log(
  "Google OAuth initiation verified. Required redirect URI:",
  url.searchParams.get("redirect_uri"),
);
console.log(
  "Google consent and callback must still be verified interactively.",
);
