// Web Crypto implements RFC 8291/8292 without a Node HTTP stack or a push provider SDK.
const encoder = new TextEncoder();
const bytes = (value: string) =>
  new Uint8Array(Buffer.from(value, "base64url"));
const base64 = (value: Uint8Array) => Buffer.from(value).toString("base64url");
const join = (...values: Uint8Array[]) => {
  const out = new Uint8Array(values.reduce((n, v) => n + v.length, 0));
  let at = 0;
  for (const value of values) {
    out.set(value, at);
    at += value.length;
  }
  return out;
};
async function hmac(
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
) {
  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, data));
}
export function publicPushKey(jwk: JsonWebKey) {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || !jwk.d)
    throw Error("Invalid VAPID configuration");
  const raw = join(new Uint8Array([4]), bytes(jwk.x), bytes(jwk.y));
  if (raw.length !== 65 || bytes(jwk.d).length !== 32)
    throw Error("Invalid VAPID configuration");
  return base64(raw);
}
export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value),
      host = url.hostname;
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.length > 1 &&
      (host === "fcm.googleapis.com" ||
        host === "updates.push.services.mozilla.com" ||
        (host.endsWith(".push.apple.com") && host !== "push.apple.com") ||
        (host.endsWith(".notify.windows.com") && host !== "notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export async function validatePushKeys(p256dh: string, auth: string) {
  const raw = bytes(p256dh);
  if (raw.length !== 65 || raw[0] !== 4 || bytes(auth).length !== 16)
    throw Error("Invalid push subscription keys");
  await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}
export async function encryptedPush(
  p256dh: string,
  auth: string,
  payload: string,
) {
  const receiver = bytes(p256dh);
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const sender = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  const peer = await crypto.subtle.importKey(
    "raw",
    receiver,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: peer },
      pair.privateKey,
      256,
    ),
  );
  const ikm = await hmac(
    await hmac(bytes(auth), shared),
    join(
      encoder.encode("WebPush: info\0"),
      receiver,
      sender,
      new Uint8Array([1]),
    ),
  );
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    prk = await hmac(salt, ikm);
  const key = (
    await hmac(prk, encoder.encode("Content-Encoding: aes128gcm\0\x01"))
  ).slice(0, 16);
  const nonce = (
    await hmac(prk, encoder.encode("Content-Encoding: nonce\0\x01"))
  ).slice(0, 12);
  const plaintext = join(encoder.encode(payload), new Uint8Array([2]));
  if (plaintext.length > 3993) throw Error("Push payload too long");
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]),
      plaintext,
    ),
  );
  return join(salt, new Uint8Array([0, 0, 16, 0, 65]), sender, encrypted);
}
export async function sendWebPush(
  jwk: JsonWebKey,
  subject: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  if (!allowedPushEndpoint(subscription.endpoint))
    throw Error("Untrusted push endpoint");
  const publicKey = publicPushKey(jwk);
  const token =
    base64(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))) +
    "." +
    base64(
      encoder.encode(
        JSON.stringify({
          aud: new URL(subscription.endpoint).origin,
          exp: Math.floor(now / 1000) + 3600,
          sub: subject,
        }),
      ),
    );
  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      encoder.encode(token),
    ),
  );
  const body = await encryptedPush(
    subscription.p256dh,
    subscription.auth,
    payload,
  );
  // No redirects: a submitted endpoint must never redirect the encrypted payload/authorization to another host.
  return transport(subscription.endpoint, {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: `vapid t=${token}.${base64(signature)}, k=${publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "900",
      Urgency: "normal",
    },
    body,
    signal: AbortSignal.timeout(5000),
  });
}
