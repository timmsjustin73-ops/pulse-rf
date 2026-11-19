import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { authClient, authEnabled } from "@/lib/auth/client";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { btnClass, fieldClass, messageOf } from "@/components/shell";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "up" ? "up" : "in",
  }),
  component: Login,
});

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"in" | "up">(initialMode === "up" ? "up" : "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isPending && user) return <RedirectToSignIn to="/" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email, password, name: name || email })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Could not sign in.");
        setBusy(false);
        return;
      }
      await navigate({ to: "/" });
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-bg text-fg lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r border-border p-10 lg:flex">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-fg">
            <Radio className="size-4" aria-hidden="true" />
          </span>
          Pulse RF
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold tracking-tight">Frequency coordination for the whole show.</h1>
          <p className="mt-4 text-muted">
            Audio, video, lighting, and comms in one browser plot. Request a channel, lock what must stay, and let the engine pack the rest.
          </p>
        </div>
        <p className="text-sm text-muted">A planning aid. Not a licence.</p>
      </section>
      <section className="grid place-items-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <p className="font-semibold">Pulse RF</p>
            <p className="text-sm text-muted">Sign in to coordinate a show.</p>
          </div>
          {authEnabled ? (
            <>
              <form onSubmit={submit} className="space-y-3">
                <h2 className="text-xl font-semibold">{mode === "in" ? "Sign in" : "Create an account"}</h2>
                {mode === "up" && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted">Name</span>
                    <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </label>
                )}
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Email</span>
                  <input
                    className={fieldClass}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Password</span>
                  <input
                    className={fieldClass}
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                  />
                </label>
                {error && <p className="text-sm text-bad">{error}</p>}
                <button className={btnClass + " w-full"} type="submit" disabled={busy}>
                  {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
                </button>
                <button
                  type="button"
                  className="text-sm text-muted underline-offset-2 hover:text-fg hover:underline"
                  onClick={() => {
                    setMode(mode === "in" ? "up" : "in");
                    setError("");
                  }}
                >
                  {mode === "in" ? "Need an account? Create one" : "Already have an account? Sign in"}
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted">Sign-in is turned off.</p>
          )}
        </div>
      </section>
    </main>
  );
}
