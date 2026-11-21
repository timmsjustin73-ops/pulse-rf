import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-semibold">Privacy</h1>
      <p>Pulse RF is a free coordination tool. This page says what we keep and why.</p>
      <h2 className="font-medium">What we collect</h2>
      <p>Name, email, phone number, company, the shows you join, the devices you request, and any scan you upload.</p>
      <h2 className="font-medium">Why</h2>
      <p>To run the plot, to let an RF manager contact you about a line, and to send the finalise email. The phone number is so the manager can call if there is a problem. We do not sell it.</p>
      <h2 className="font-medium">Who sees it</h2>
      <p>You. Your company. The RF manager on a show you are on. The admin of Pulse RF. No one else.</p>
      <h2 className="font-medium">How long</h2>
      <p>While your account exists. Ask and we will delete it.</p>
      <h2 className="font-medium">Cookies</h2>
      <p>Only to keep you signed in.</p>
      <p className="text-muted">Pulse RF, Melbourne. Contact justin@jtlive.tech.</p>
      <Link to="/site" className="text-primary">Back</Link>
    </article>
  );
}
