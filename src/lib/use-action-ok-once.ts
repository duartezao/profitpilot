"use client";

import { useEffect, useRef } from "react";

/** Chama `onOk` só na transição para sucesso — evita loops com callbacks instáveis. */
export function useActionOkOnce(
  ok: boolean | undefined,
  onOk: (() => void) | undefined,
) {
  const seen = useRef(false);
  useEffect(() => {
    if (!ok) {
      seen.current = false;
      return;
    }
    if (seen.current) return;
    seen.current = true;
    onOk?.();
  }, [ok, onOk]);
}
