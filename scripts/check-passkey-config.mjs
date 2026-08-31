const isCi = process.env.CI === "true";
const originValue =
  process.env.NEXT_PUBLIC_APP_ORIGIN ??
  (isCi ? "" : "http://localhost:3000");
const rpId =
  process.env.NEXT_PUBLIC_PASSKEY_RP_ID ?? (isCi ? "" : "localhost");

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!originValue || !rpId) {
  fail("Missing passkey origin configuration.");
}

let origin;
try {
  origin = new URL(originValue);
} catch {
  fail("Missing passkey origin configuration.");
}

if (origin.hostname !== rpId) {
  fail("Passkey RP ID does not match the app origin.");
}

const localHttp = origin.protocol === "http:" && origin.hostname === "localhost";
if (origin.protocol !== "https:" && !localHttp) {
  fail("Production passkeys require a non-local HTTPS origin.");
}
if (isCi && origin.hostname === "localhost") {
  fail("Production passkeys require a non-local HTTPS origin.");
}

console.log(`Passkey origin verified: ${origin.origin} (${rpId})`);
