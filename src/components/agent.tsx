import { useEffect, useState } from "react";
import { fieldClass } from "@/components/shell";
import { agentAct, agentEnabled } from "@/lib/pulse.functions";

export function AgentBadge({ eventId, page, context }: { eventId?: string; page: string; context?: string }) {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  useEffect(() => { void agentEnabled().then((r) => setOn(r.on)); }, []);
  if (!on) return null;
  return (
    <>
      <button type="button" className="fixed bottom-4 right-4 z-40 rounded-full bg-primary px-3 py-2 text-sm text-primary-fg shadow" onClick={() => setOpen((v) => !v)}>Agent</button>
      {open && (
        <form className="fixed bottom-16 right-4 z-40 w-80 rounded-xl border border-border bg-card p-3 text-sm shadow" onSubmit={(e) => {
          e.preventDefault();
          setReply("Working…");
          void agentAct({ data: { page, eventId: eventId ?? "", text, context: context ?? "" } }).then((r) => {
            setReply(r.reply);
            if (r.href) window.location.href = r.href;
          }).catch((err: unknown) => setReply(err instanceof Error ? err.message : "Failed"));
        }}>
          <p className="mb-2 font-medium">Agent · {page}</p>
          <input className={fieldClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about this page" />
          <button className="mt-2 rounded-lg bg-primary px-3 py-1 text-primary-fg" type="submit">Ask</button>
          {reply && <p className="mt-2 text-muted">{reply}</p>}
        </form>
      )}
    </>
  );
}
