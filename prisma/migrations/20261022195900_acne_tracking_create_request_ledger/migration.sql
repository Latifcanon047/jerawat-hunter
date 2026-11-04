CREATE TABLE "AcneTrackingCreateRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestKey" VARCHAR(128) NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "trackingId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AcneTrackingCreateRequest_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AcneTrackingCreateRequest" (
  "id",
  "userId",
  "requestKey",
  "fingerprint",
  "trackingId",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "userId",
  "createRequestKey",
  "createRequestFingerprint",
  "id",
  "createdAt",
  "updatedAt"
FROM "AcneTracking";

CREATE UNIQUE INDEX "AcneTrackingCreateRequest_userId_requestKey_key"
ON "AcneTrackingCreateRequest"("userId", "requestKey");

CREATE INDEX "AcneTrackingCreateRequest_trackingId_idx"
ON "AcneTrackingCreateRequest"("trackingId");

ALTER TABLE "AcneTrackingCreateRequest"
ADD CONSTRAINT "AcneTrackingCreateRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "AcneTracking_userId_createRequestKey_key";

ALTER TABLE "AcneTracking"
DROP COLUMN "createRequestKey",
DROP COLUMN "createRequestFingerprint";
