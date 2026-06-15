"use client";

import {
  forwardRef,
  type ChangeEvent,
  type ClipboardEvent,
  type InputHTMLAttributes,
} from "react";
import { normalizeDecimalInput } from "@/lib/parse-number";
import { cn } from "@/lib/utils";

export type DecimalInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode"
>;

function applyNormalized(el: HTMLInputElement) {
  const next = normalizeDecimalInput(el.value);
  if (next !== el.value) {
    el.value = next;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(
  function DecimalInput(
    { className, onChange, onPaste, onBlur, ...props },
    ref,
  ) {
    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={cn(className)}
        onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
          const text = e.clipboardData.getData("text");
          if (/[,\u00a0]/.test(text) || (text.includes(".") && text.includes(","))) {
            e.preventDefault();
            const normalized = normalizeDecimalInput(text);
            const el = e.currentTarget;
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? start;
            el.value =
              el.value.slice(0, start) + normalized + el.value.slice(end);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          onPaste?.(e);
        }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          applyNormalized(e.currentTarget);
          onChange?.(e);
        }}
        onBlur={(e) => {
          applyNormalized(e.currentTarget);
          onBlur?.(e);
        }}
        {...props}
      />
    );
  },
);
