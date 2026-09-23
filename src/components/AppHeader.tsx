import Link from "next/link";

export function AppHeader({ active }: { active?: "new" | "history" }) {
  const tab = (href: string, label: string, key: "new" | "history") => (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${
        active === key
          ? "bg-foreground text-background"
          : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Resale Lister
        </Link>
        <nav className="flex items-center gap-1">
          {tab("/", "New", "new")}
          {tab("/history", "History", "history")}
          <form action="/auth/signout" method="post">
            <button className="px-2 py-1.5 text-sm text-muted hover:text-foreground">
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
