import Link from "next/link";

export function AppHeader({ active }: { active?: "new" | "history" | "profit" }) {
  const tab = (href: string, label: string, key: "new" | "history" | "profit") => (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium ${
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
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-3 py-3 sm:px-4">
        <Link href="/" className="whitespace-nowrap text-base font-semibold tracking-tight">
          Resale<span className="hidden sm:inline"> Lister</span>
        </Link>
        <nav className="flex items-center gap-0.5">
          {tab("/", "New", "new")}
          {tab("/history", "History", "history")}
          {tab("/profit", "Profit", "profit")}
          <form action="/auth/signout" method="post">
            <button className="whitespace-nowrap px-2 py-1.5 text-sm text-muted hover:text-foreground">
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
