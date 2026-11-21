import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/events/$eventId/")({
  component: () => {
    const { eventId } = Route.useParams();
    return <Navigate to="/events/$eventId/requests" params={{ eventId }} />;
  },
});
