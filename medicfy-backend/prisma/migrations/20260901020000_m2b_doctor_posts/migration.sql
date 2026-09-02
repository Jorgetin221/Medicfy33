-- M2B (spec §7, v2.2) — publicaciones del médico y control de audiencia.

CREATE TYPE "post_category" AS ENUM ('HEALTH_EDUCATION', 'HEALTH_TIP', 'HEALTH_FACT', 'PROFESSIONAL_UPDATE', 'CONGRESS', 'RESEARCH', 'CERTIFICATION', 'PATIENT_NOTICE', 'PREVENTION', 'LIFESTYLE', 'VIDEO', 'PHOTO', 'ANNOUNCEMENT');
CREATE TYPE "post_visibility" AS ENUM ('PUBLIC', 'PATIENTS_ONLY', 'PRIVATE');
CREATE TYPE "post_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "post_media_type" AS ENUM ('PHOTO', 'VIDEO');

CREATE TABLE "doctor_posts" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "category" "post_category" NOT NULL,
    "visibility" "post_visibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "post_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "archivedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "doctor_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doctor_post_media" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaType" "post_media_type" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_post_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "doctor_posts_doctorId_idx" ON "doctor_posts"("doctorId");
CREATE INDEX "doctor_post_media_postId_idx" ON "doctor_post_media"("postId");

ALTER TABLE "doctor_posts" ADD CONSTRAINT "doctor_posts_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_post_media" ADD CONSTRAINT "doctor_post_media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "doctor_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
