"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { hrefWithScope } from "@/lib/scope-query";

function ScopeLinkInner({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  return (
    <Link href={hrefWithScope(href, searchParams)} className={className}>
      {children}
    </Link>
  );
}

export function ScopeLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <Link href={href} className={className}>
          {children}
        </Link>
      }
    >
      <ScopeLinkInner href={href} className={className}>
        {children}
      </ScopeLinkInner>
    </Suspense>
  );
}
