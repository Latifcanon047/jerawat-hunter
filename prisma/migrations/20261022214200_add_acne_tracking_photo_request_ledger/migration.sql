CREATE TYPE "AcneTrackingPhotoRequestStatus" AS ENUM (
  'PENDING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "AcneTrackingPhotoRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trackingId" TEXT NOT NULL,
  "requestKey" VARCHAR(128) NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "status" "AcneTrackingPhotoRequestStatus" NOT NULL DEFAULT 'PENDING',
  "intentId" TEXT,
  "photoWidth" INTEGER,
  "photoHeight" INTEGER,
  "markerX" DOUBLE PRECISION,
  "markerY" DOUBLE PRECISION,
  "failureCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AcneTrackingPhotoRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcneTrackingPhotoRequest_result_check"
    CHECK (
      (
        "status" = 'COMPLETED'
        AND "photoWidth" IS NOT NULL AND "photoWidth" > 0
        AND "photoHeight" IS NOT NULL AND "photoHeight" > 0
        AND "markerX" IS NOT NULL AND "markerX" >= 0 AND "markerX" <= 1
        AND "markerY" IS NOT NULL AND "markerY" >= 0 AND "markerY" <= 1
        AND "failureCode" IS NULL
      )
      OR (
        "status" IN ('PENDING', 'FAILED')
        AND "photoWidth" IS NULL
        AND "photoHeight" IS NULL
        AND "markerX" IS NULL
        AND "markerY" IS NULL
        AND ("status" = 'FAILED' OR "failureCode" IS NULL)
      )
    )
);

CREATE UNIQUE INDEX "AcneTrackingPhotoRequest_userId_trackingId_requestKey_key"
ON "AcneTrackingPhotoRequest"("userId", "trackingId", "requestKey");

CREATE UNIQUE INDEX "AcneTrackingPhotoRequest_intentId_key"
ON "AcneTrackingPhotoRequest"("intentId");

CREATE INDEX "AcneTrackingPhotoRequest_status_updatedAt_idx"
ON "AcneTrackingPhotoRequest"("status", "updatedAt");

ALTER TABLE "AcneTrackingPhotoRequest"
ADD CONSTRAINT "AcneTrackingPhotoRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AcneTrackingPhotoRequest"
ADD CONSTRAINT "AcneTrackingPhotoRequest_intentId_fkey"
FOREIGN KEY ("intentId") REFERENCES "PhotoUploadIntent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
