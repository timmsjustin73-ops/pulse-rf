import { useState } from "react";
import { fieldClass } from "@/components/shell";
import { agentAdd } from "@/lib/pulse.functions";

export function AgentPanel({ eventId }: { eventId: string }) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  return (
    <form className="rounded-xl border border-border p-3 text-sm" onSubmit={(e) => {
      e.preventDefault();
      setReply("Looking…");
      void agentAdd({ data: { eventId, text } }).then((r) => {
        setReply(r.found ? `Matched ${r.name}. Band ${r.band}. Power ${r.power}. Add it from Requests to place it.` : "No match. Try the series and the band, for example ULX-D G50.");
      }).catch((err: unknown) => setReply(err instanceof Error ? err.message : "Failed"));
    }}>
      <p className="mb-2 font-medium">Agent</p>
      <div className="flex gap-2">
        <input className={fieldClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="ULX-D G50 lead vocal" />
        <button className="rounded-lg bg-primary px-3 text-primary-fg" type="submit">Ask</button>
      </div>
      {reply && <p className="mt-2 text-muted">{reply}</p>}
    </form>
  );
}
