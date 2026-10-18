"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Fingerprint } from "lucide-react";
import { Button } from "./ui/button";
import { authClient } from "@/lib/auth-client";
import { authError, registerSchema, type AuthResult } from "@/lib/auth-schema";
export function FormResult({ result }: { result: AuthResult }) {
  return (
    <>
      {result.error && (
        <p className="error-banner" role="alert">
          {result.error}
        </p>
      )}
      {result.message && (
        <p className="notice" role="status">
          {result.message}
        </p>
      )}
    </>
  );
}
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const register = mode === "register";
  const [result, setResult] = useState<AuthResult>({});
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!window.PublicKeyCredential) {
      setResult({
        error:
          "เบราว์เซอร์นี้ยังใช้ Passkey ไม่ได้ กรุณาเปิดใน Safari, Chrome หรือ Edge รุ่นปัจจุบันผ่าน HTTPS",
      });
      return;
    }
    const parsed = register
      ? registerSchema.safeParse(
          Object.fromEntries(new FormData(event.currentTarget)),
        )
      : null;
    if (parsed && !parsed.success) {
      setResult({
        error: "ตรวจสอบข้อมูลในแบบฟอร์ม",
        fields: z.flattenError(parsed.error).fieldErrors,
      });
      return;
    }
    setPending(true);
    setResult({});
    try {
      const response =
        register && parsed?.success
          ? await authClient.passkey.addPasskey({
              context: JSON.stringify(parsed.data),
              name: parsed.data.username,
              createSession: true,
            })
          : await authClient.signIn.passkey();
      if (response.error || !response.data) {
        setResult({
          error:
            response.error?.status === 429
              ? authError("TOO_MANY_REQUESTS")
              : authError(
                  response.error && "code" in response.error
                    ? String(response.error.code)
                    : undefined,
                ),
        });
        setPending(false);
        return;
      }
      router.replace("/account");
    } catch {
      setResult({ error: "เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่" });
      setPending(false);
    }
  }
  return (
    <>
      <form method="post" onSubmit={submit} className="editor-form" noValidate>
        {register && (
          <fieldset disabled={pending} className="auth-fieldset">
            {[
              {
                name: "display_name",
                label: "ชื่อของคุณ",
                auto: "nickname",
                max: 120,
              },
              {
                name: "username",
                label: "ชื่อผู้ใช้",
                auto: "username",
                max: 32,
              },
            ].map((field) => (
              <div className="form-field" key={field.name}>
                <label htmlFor={"auth-" + field.name}>{field.label}</label>
                <input
                  id={"auth-" + field.name}
                  name={field.name}
                  type="text"
                  autoComplete={field.auto}
                  maxLength={field.max}
                  required
                  aria-invalid={!!result.fields?.[field.name]}
                  aria-describedby={
                    result.fields?.[field.name]
                      ? "error-" + field.name
                      : undefined
                  }
                />
                {result.fields?.[field.name] && (
                  <p className="field-error" id={"error-" + field.name}>
                    {result.fields[field.name]?.[0]}
                  </p>
                )}
              </div>
            ))}
          </fieldset>
        )}
        <p className="muted text-sm">
          ใช้ลายนิ้วมือ ใบหน้า หรือ PIN ของเครื่องเพื่อยืนยัน Passkey
          โดยไม่ต้องตั้งรหัสผ่าน
          {register && " · ชื่อผู้ใช้ใช้ a–z, 0–9 และ _ ยาว 3–32 ตัว"}
        </p>
        <FormResult result={result} />
        <Button disabled={pending} type="submit" className="full-width">
          <Fingerprint size={18} />
          {pending
            ? "กำลังรอยืนยัน Passkey…"
            : register
              ? "สมัครด้วย Passkey"
              : "เข้าสู่ระบบด้วย Passkey"}
        </Button>
        <p className="muted text-sm">
          Passkey ใช้กับเว็บไซต์นี้เท่านั้น แนะนำให้บันทึกในตัวจัดการ Passkey
          ที่ซิงก์อุปกรณ์ได้ และเพิ่ม Passkey สำรองในหน้าบัญชี หากไม่มี Passkey
          เหลือจะยังไม่สามารถกู้บัญชีผ่านอีเมลได้
        </p>
      </form>
      <p className="auth-switch">
        {register ? "มีบัญชีอยู่แล้ว?" : "ยังไม่มีบัญชี?"}{" "}
        <Link href={register ? "/login" : "/register"}>
          {register ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </Link>
      </p>
    </>
  );
}
export function AddPasskeyButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AuthResult>({});
  return (
    <div className="editor-form">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setResult({});
          try {
            const response = await authClient.passkey.addPasskey({
              name: "Passkey สำรอง",
            });
            setResult(
              response.error
                ? {
                    error:
                      response.error.status === 401
                        ? "เข้าสู่ระบบใหม่ก่อนเพิ่ม Passkey สำรอง"
                        : authError(
                            "code" in response.error
                              ? String(response.error.code)
                              : undefined,
                          ),
                  }
                : { message: "เพิ่ม Passkey สำรองแล้ว" },
            );
          } catch {
            setResult({ error: "เพิ่ม Passkey ไม่สำเร็จ กรุณาลองใหม่" });
          }
          setPending(false);
        }}
      >
        <Fingerprint size={16} />
        {pending ? "กำลังรอยืนยัน…" : "เพิ่ม Passkey สำรอง"}
      </Button>
      <FormResult result={result} />
    </div>
  );
}
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const response = await fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (!response.ok) throw Error();
            router.replace("/login?notice=signed-out");
          } catch {
            setError("ออกจากระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
            setPending(false);
          }
        }}
      >
        {pending ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
      </Button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
