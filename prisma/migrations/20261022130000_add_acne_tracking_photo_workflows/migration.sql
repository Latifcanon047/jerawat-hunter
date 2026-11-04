CREATE TYPE "AcneLocation" AS ENUM (
  'forehead',
  'left_temple',
  'right_temple',
  'nose',
  'left_cheek',
  'right_cheek',
  'around_mouth',
  'chin',
  'left_jaw',
  'right_jaw'
);

CREATE TYPE "AcneTrackingStatus" AS ENUM ('ACTIVE', 'HEALED');

CREATE TYPE "PhotoUploadIntentStatus" AS ENUM (
  'PENDING',
  'CLEANUP_QUEUED'
);

CREATE TYPE "CloudinaryCleanupJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'DEAD'
);

CREATE TABLE "AcneTracking" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createRequestKey" VARCHAR(128) NOT NULL,
  "createRequestFingerprint" VARCHAR(64) NOT NULL,
  "name" TEXT NOT NULL,
  "location" "AcneLocation" NOT NULL,
  "startedAt" DATE NOT NULL,
  "status" "AcneTrackingStatus" NOT NULL DEFAULT 'ACTIVE',
  "healedDate" DATE,
  "photoPublicId" TEXT,
  "photoWidth" INTEGER,
  "photoHeight" INTEGER,
  "markerX" DOUBLE PRECISION,
  "markerY" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AcneTracking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcneTracking_name_not_blank_check"
    CHECK (length(btrim("name")) > 0),
  CONSTRAINT "AcneTracking_status_healedDate_check"
    CHECK (
      ("status" = 'ACTIVE' AND "healedDate" IS NULL)
      OR ("status" = 'HEALED' AND "healedDate" IS NOT NULL)
    ),
  CONSTRAINT "AcneTracking_photo_metadata_check"
    CHECK (
      (
        "photoPublicId" IS NULL
        AND "photoWidth" IS NULL
        AND "photoHeight" IS NULL
        AND "markerX" IS NULL
        AND "markerY" IS NULL
      )
      OR (
        "photoPublicId" IS NOT NULL
        AND "photoWidth" IS NOT NULL
        AND "photoWidth" > 0
        AND "photoHeight" IS NOT NULL
        AND "photoHeight" > 0
        AND "markerX" IS NOT NULL
        AND "markerX" >= 0
        AND "markerX" <= 1
        AND "markerY" IS NOT NULL
        AND "markerY" >= 0
        AND "markerY" <= 1
      )
    )
);

CREATE TABLE "PhotoUploadIntent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "acneTrackingId" TEXT,
  "publicId" TEXT NOT NULL,
  "status" "PhotoUploadIntentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhotoUploadIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CloudinaryCleanupJob" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "status" "CloudinaryCleanupJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "lastError" VARCHAR(500),
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CloudinaryCleanupJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CloudinaryCleanupJob_attempts_check"
    CHECK ("attempts" >= 0 AND "attempts" <= 8),
  CONSTRAINT "CloudinaryCleanupJob_lease_check"
    CHECK (
      ("status" = 'PROCESSING' AND "lockedUntil" IS NOT NULL)
      OR ("status" <> 'PROCESSING' AND "lockedUntil" IS NULL)
    )
);

CREATE UNIQUE INDEX "AcneTracking_photoPublicId_key"
ON "AcneTracking"("photoPublicId");

CREATE UNIQUE INDEX "AcneTracking_userId_createRequestKey_key"
ON "AcneTracking"("userId", "createRequestKey");

CREATE INDEX "AcneTracking_userId_status_startedAt_idx"
ON "AcneTracking"("userId", "status", "startedAt");

CREATE UNIQUE INDEX "PhotoUploadIntent_publicId_key"
ON "PhotoUploadIntent"("publicId");

CREATE INDEX "PhotoUploadIntent_status_createdAt_idx"
ON "PhotoUploadIntent"("status", "createdAt");

CREATE INDEX "PhotoUploadIntent_acneTrackingId_idx"
ON "PhotoUploadIntent"("acneTrackingId");

CREATE UNIQUE INDEX "CloudinaryCleanupJob_publicId_key"
ON "CloudinaryCleanupJob"("publicId");

CREATE INDEX "CloudinaryCleanupJob_status_nextAttemptAt_idx"
ON "CloudinaryCleanupJob"("status", "nextAttemptAt");

CREATE INDEX "CloudinaryCleanupJob_status_lockedUntil_idx"
ON "CloudinaryCleanupJob"("status", "lockedUntil");

ALTER TABLE "AcneTracking"
ADD CONSTRAINT "AcneTracking_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhotoUploadIntent"
ADD CONSTRAINT "PhotoUploadIntent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhotoUploadIntent"
ADD CONSTRAINT "PhotoUploadIntent_acneTrackingId_fkey"
FOREIGN KEY ("acneTrackingId") REFERENCES "AcneTracking"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
