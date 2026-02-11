-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ONGOING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobScenario" AS ENUM ('CHAINED', 'SEQUENTIAL', 'RACE');

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "scenario" "JobScenario" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRunStep" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRunStep_runId_idx" ON "JobRunStep"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "JobRunStep_runId_step_key" ON "JobRunStep"("runId", "step");

-- AddForeignKey
ALTER TABLE "JobRunStep" ADD CONSTRAINT "JobRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "JobRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
