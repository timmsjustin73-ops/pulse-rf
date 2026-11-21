import { createContext, useContext } from "react";
import type { getEvent, listCustomDevices } from "@/lib/pulse.functions";

export type Bundle = Awaited<ReturnType<typeof getEvent>>;

export type EventWork = {
  data: Bundle;
  visible: Bundle;
  custom: Awaited<ReturnType<typeof listCustomDevices>>;
  manager: boolean;
  canRequest: boolean;
  busy: string;
  run: (label: string, action: () => Promise<Bundle | { ok: boolean } | { id: string }>) => Promise<void>;
  eventId: string;
  onEdit: (id: string) => void;
};

export const EventContext = createContext<EventWork | null>(null);

export function useEventWork(): EventWork {
  const value = useContext(EventContext);
  if (!value) throw new Error("Missing event");
  return value;
}
