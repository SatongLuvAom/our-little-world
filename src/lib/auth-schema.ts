import { z } from "zod";
import { today } from "./utils";
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,32}$/, "ชื่อผู้ใช้ใช้ a–z, 0–9 และ _ ยาว 3–32 ตัว");
export const registerSchema = z.object({
  username: usernameSchema,
  display_name: z
    .string()
    .trim()
    .min(1, "กรอกชื่อของคุณ")
    .max(120, "ชื่อไม่เกิน 120 ตัวอักษร"),
});
export const anniversarySchema = z.object({
  anniversary: z.iso
    .date("เลือกวันที่เริ่มคบกัน")
    .refine(
      (day) => day >= "1900-01-01" && day <= today(),
      "เลือกวันที่ตั้งแต่ปี 1900 ถึงวันนี้",
    ),
});
export const invitationSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/, "รหัสคำเชิญต้องเป็นตัวอักษรและตัวเลข 64 ตัว"),
});
export const accountContextSchema = z.object({
  profile: z.object({
    id: z.uuid(),
    display_name: z.string(),
    username: z.string(),
  }),
  couple: z
    .object({
      id: z.uuid(),
      anniversary: z.iso.date(),
      timezone: z.literal("Asia/Bangkok"),
      members: z
        .array(z.object({ id: z.uuid(), display_name: z.string() }))
        .min(1)
        .max(2),
      invitation: z.object({ id: z.uuid(), expires_at: z.number() }).nullable(),
    })
    .nullable(),
});
export type AccountContext = z.infer<typeof accountContextSchema>;
export type AuthResult = {
  error?: string;
  message?: string;
  fields?: Record<string, string[] | undefined>;
};
export type PairResult = AuthResult & {
  token?: string;
  invitationId?: string;
  expiresAt?: number;
};
export function authError(code?: string) {
  if (
    [
      "AUTH_CANCELLED",
      "REGISTRATION_CANCELLED",
      "ERROR_CEREMONY_ABORTED",
      "ERROR_PASSTHROUGH_SEE_CAUSE",
      "ERROR_AUTHENTICATOR_GENERAL_ERROR",
    ].includes(code || "")
  )
    return "ยังไม่ได้ยืนยัน Passkey หรือไม่พบ Passkey สำหรับเว็บนี้ ลองใหม่แล้วเลือกบัญชีที่ต้องการ";
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
    return "Passkey นี้ถูกเพิ่มแล้ว กรุณาใช้เครื่องหรือตัวจัดการ Passkey อีกตัว";
  if (code === "ERROR_INVALID_RP_ID")
    return "Passkey ต้องใช้โดเมน HTTPS ของแอป หรือ localhost ในเครื่องพัฒนา";
  if (
    [
      "INVALID_USERNAME_OR_PASSWORD",
      "INVALID_EMAIL_OR_PASSWORD",
      "USER_NOT_FOUND",
    ].includes(code || "")
  )
    return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
  if (
    [
      "USERNAME_IS_ALREADY_TAKEN",
      "USER_ALREADY_EXISTS",
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    ].includes(code || "")
  )
    return "ชื่อผู้ใช้นี้ไม่พร้อมใช้งาน กรุณาเลือกชื่ออื่น";
  if (code === "TOO_MANY_REQUESTS")
    return "มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่";
  return "ดำเนินการไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่";
}
export function pairingError(message: string) {
  if (message.includes("already_paired"))
    return "บัญชีนี้อยู่ในคู่รักแล้ว ไม่สามารถเข้าคู่อื่นได้";
  if (message.includes("couple_full")) return "คู่นี้มีสมาชิกครบ 2 คนแล้ว";
  if (message.includes("couple_required"))
    return "สร้างคู่ของเราก่อนสร้างรหัสคำเชิญ";
  if (message.includes("invitation_unavailable"))
    return "รหัสคำเชิญไม่ถูกต้อง หมดอายุ ถูกยกเลิก หรือใช้งานแล้ว";
  return "บันทึกการจับคู่ไม่สำเร็จ กรุณาลองใหม่";
}
