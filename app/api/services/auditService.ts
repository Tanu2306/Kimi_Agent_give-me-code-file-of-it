import { getDb } from "../queries/connection";
import { auditEvents } from "@db/schema";

export async function recordAudit(eventType: string, mandateId: string | null, eventData?: unknown) {
  await getDb().insert(auditEvents).values({
    eventType,
    mandateId,
    eventData: eventData === undefined ? null : (eventData as Record<string, unknown>),
  });
}

export async function listAuditEvents(limit = 30) {
  return getDb().select().from(auditEvents).orderBy(auditEvents.createdAt).limit(limit);
}
