ALTER TABLE "PauseSession"
ADD COLUMN "pickingFollowUpCompleted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PauseSession"
SET "pickingFollowUpCompleted" = true
WHERE "outcome" = 'PICKED'
  AND EXISTS (
    SELECT 1
    FROM "PickingEvent"
    WHERE "PickingEvent"."pauseSessionId" = "PauseSession"."id"
  );
