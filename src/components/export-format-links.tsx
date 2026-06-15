"use client";

import { Download } from "lucide-react";

type ExportFormatLinksProps = {
  /** URL base sem `format` (pode já ter query string). */
  href: string;
  className?: string;
};

function linkHref(base: string, format: "csv" | "xlsx" | "pdf"): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}format=${format}`;
}

export function ExportFormatLinks({
  href,
  className,
}: ExportFormatLinksProps) {
  const cls =
    className ??
    "inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-muted";

  return (
    <div className="flex flex-wrap gap-2">
      <a href={linkHref(href, "csv")} className={cls} download>
        <Download className="h-4 w-4" />
        CSV
      </a>
      <a href={linkHref(href, "xlsx")} className={cls} download>
        <Download className="h-4 w-4" />
        Excel
      </a>
      <a href={linkHref(href, "pdf")} className={cls} download>
        <Download className="h-4 w-4" />
        PDF
      </a>
    </div>
  );
}
