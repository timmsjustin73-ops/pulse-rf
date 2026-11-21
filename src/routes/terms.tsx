import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-6">
      <h1 className="text-2xl font-semibold">Terms</h1>
      <p>Pulse RF is free to use. These terms cover that use.</p>
      <h2 className="font-medium">What it is</h2>
      <p>A planning tool for wireless audio. It suggests frequencies. It does not guarantee a clean show. The RF manager is responsible for the final plot.</p>
      <h2 className="font-medium">ACMA data</h2>
      <p>Television channels are looked up as a guide. They can be wrong or late. Check them before the show.</p>
      <h2 className="font-medium">Your account</h2>
      <p>You are responsible for what you submit. We can suspend an account that is misused.</p>
      <h2 className="font-medium">No warranty</h2>
      <p>The tool is provided as it is. We are not liable for a lost frequency, a failed pack, or a show that does not go to plan.</p>
      <h2 className="font-medium">Law</h2>
      <p>These terms are under the law of Victoria, Australia.</p>
      <p className="text-muted">Pulse RF, Melbourne. Contact justin@jtlive.tech.</p>
      <Link to="/site" className="text-primary">Back</Link>
    </article>
  );
}
