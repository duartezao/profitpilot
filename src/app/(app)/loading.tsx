export default function AppLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-4">
      <div className="h-9 w-40 rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[88px] rounded-lg border border-border bg-muted/80"
          />
        ))}
      </div>
      <div className="h-52 rounded-lg border border-border bg-muted/60" />
    </div>
  );
}
