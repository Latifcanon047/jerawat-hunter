-- CreateEnum
CREATE TYPE "PauseOutcome" AS ENUM ('SUCCEEDED', 'STILL_RESISTING', 'PICKED');

-- CreateEnum
CREATE TYPE "PickingType" AS ENUM ('SQUEEZE', 'PEEL', 'TOUCH_FIDGET');

-- CreateEnum
CREATE TYPE "DurationRange" AS ENUM ('UNDER_1_MIN', 'FROM_1_TO_5_MIN', 'FROM_6_TO_15_MIN', 'FROM_16_TO_30_MIN', 'OVER_30_MIN');

-- CreateEnum
CREATE TYPE "ContextType" AS ENUM ('ALONE_IN_ROOM', 'IN_FRONT_OF_MIRROR', 'USING_PHONE_WATCHING', 'STUDYING_WORKING', 'BEFORE_SLEEP', 'OTHER_ACTIVITY', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PauseSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "durationSecs" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedEarly" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "PauseOutcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PauseSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickingEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickingType" "PickingType" NOT NULL,
    "triggers" TEXT[],
    "emotions" TEXT[],
    "urgeStrength" INTEGER,
    "durationRange" "DurationRange",
    "reasons" TEXT[],
    "impacts" TEXT[],
    "context" "ContextType",
    "pauseSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resistance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pauseSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resistance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PauseSession_userId_startedAt_idx" ON "PauseSession"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PickingEvent_pauseSessionId_key" ON "PickingEvent"("pauseSessionId");

-- CreateIndex
CREATE INDEX "PickingEvent_userId_recordedAt_idx" ON "PickingEvent"("userId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Resistance_pauseSessionId_key" ON "Resistance"("pauseSessionId");

-- CreateIndex
CREATE INDEX "Resistance_userId_recordedAt_idx" ON "Resistance"("userId", "recordedAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PauseSession" ADD CONSTRAINT "PauseSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickingEvent" ADD CONSTRAINT "PickingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickingEvent" ADD CONSTRAINT "PickingEvent_pauseSessionId_fkey" FOREIGN KEY ("pauseSessionId") REFERENCES "PauseSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resistance" ADD CONSTRAINT "Resistance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resistance" ADD CONSTRAINT "Resistance_pauseSessionId_fkey" FOREIGN KEY ("pauseSessionId") REFERENCES "PauseSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
