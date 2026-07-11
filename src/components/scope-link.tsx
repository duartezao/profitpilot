"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/components/workspace-context";
import { hrefWithScopeAndStore } from "@/lib/scope-query";

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
  const { workspaceId } = useWorkspace();
  return (
    <Link
      href={hrefWithScopeAndStore(href, searchParams, workspaceId)}
      className={className}
    >
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
