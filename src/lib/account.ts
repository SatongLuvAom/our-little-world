"use client";
import { useEffect, useState } from "react";
import {
  accountContextSchema,
  type AccountContext,
  type PairResult,
} from "./auth-schema";
async function fetchContext(signal?: AbortSignal) {
  const response = await fetch("/api/account/context", {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) {
    window.location.replace("/login");
    return null;
  }
  if (!response.ok) throw new Error("โหลดบัญชีไม่สำเร็จ กรุณาลองใหม่");
  return accountContextSchema.parse(await response.json());
}
export function useAccount() {
  const [context, setContext] = useState<AccountContext | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetchContext(controller.signal)
      .then(setContext)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  async function refresh() {
    setError("");
    try {
      setContext(await fetchContext());
    } catch (error) {
      setError(error instanceof Error ? error.message : "โหลดบัญชีไม่สำเร็จ");
    }
  }
  return { context, error, refresh };
}
export async function accountMutation(
  operation: string,
  form?: FormData,
): Promise<PairResult> {
  try {
    const response = await fetch("/api/account/" + operation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form ? Object.fromEntries(form) : {}),
    });
    if (response.status === 401) {
      window.location.replace("/login");
      return { error: "กรุณาเข้าสู่ระบบอีกครั้ง" };
    }
    const result = await response.json();
    if (!response.ok && !result.error)
      return { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" };
    return result;
  } catch {
    return { error: "เชื่อมต่อไม่ได้ กรุณาลองใหม่" };
  }
}
