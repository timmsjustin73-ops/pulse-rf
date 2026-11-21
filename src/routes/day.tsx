import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/day")({ component: DayPage });

function DayPage() {
  return (
    <div className="min-h-screen bg-bg p-4 text-fg">
      <h1 className="text-xl font-semibold">Today</h1>
      <p className="mt-2 text-sm text-muted">Your lines, the frequency, and Tuned. Open a show to mark them.</p>
      <Link to="/" className="mt-4 inline-block text-sm text-primary">Events</Link>
    </div>
  );
}
