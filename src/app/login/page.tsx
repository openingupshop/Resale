import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Resale Lister</h1>
      <p className="mt-1 text-sm text-muted">
        Snap an item, get a listing for eBay, Poshmark, and Facebook Marketplace.
      </p>
      <LoginForm linkError={error === "link"} />
    </main>
  );
}
