-- CreateTable
CREATE TABLE "note_templates" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "shortcutKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "note_templates_doctorId_shortcutKey_key" ON "note_templates"("doctorId", "shortcutKey");

-- AddForeignKey
ALTER TABLE "note_templates" ADD CONSTRAINT "note_templates_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissions for medicfy_app — mismo patrón que cada tabla nueva en
-- este proyecto (ver p. ej. availability_exceptions): sin UPDATE
-- porque el controller solo crea/lista/borra, nunca edita una
-- plantilla existente.
REVOKE ALL ON TABLE "note_templates" FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON TABLE "note_templates" TO medicfy_app;
