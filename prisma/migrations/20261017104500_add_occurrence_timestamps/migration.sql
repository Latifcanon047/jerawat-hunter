ALTER TABLE "Resistance"
DROP COLUMN "occurredAt",
ADD COLUMN "occurredAt" TIMESTAMPTZ(3);

ALTER TABLE "PickingEvent"
ADD COLUMN "occurredAt" TIMESTAMPTZ(3);

CREATE INDEX "Resistance_userId_occurredAt_idx"
ON "Resistance"("userId", "occurredAt");

CREATE INDEX "PickingEvent_userId_occurredAt_idx"
ON "PickingEvent"("userId", "occurredAt");
