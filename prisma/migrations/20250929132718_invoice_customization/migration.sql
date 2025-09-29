-- CreateTable
CREATE TABLE "invoice_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateType" TEXT NOT NULL DEFAULT 'STANDARD',
    "htmlTemplate" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "tags" TEXT,
    "previewUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "invoice_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoice_styles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cssContent" TEXT NOT NULL,
    "colorScheme" TEXT NOT NULL,
    "fontFamily" TEXT NOT NULL DEFAULT 'Arial, sans-serif',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "tags" TEXT,
    "previewUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "invoice_styles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_styles_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "invoice_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "organization_branding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "logoWidth" INTEGER,
    "logoHeight" INTEGER,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showOrgName" BOOLEAN NOT NULL DEFAULT true,
    "primaryColor" TEXT NOT NULL DEFAULT '#000000',
    "secondaryColor" TEXT NOT NULL DEFAULT '#666666',
    "accentColor" TEXT NOT NULL DEFAULT '#0066cc',
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textColor" TEXT NOT NULL DEFAULT '#000000',
    "displaySettings" TEXT NOT NULL,
    "customCss" TEXT,
    "taxesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultTaxExempt" BOOLEAN NOT NULL DEFAULT false,
    "taxDisplaySettings" TEXT,
    "defaultTemplateId" TEXT,
    "defaultStyleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "organization_branding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "generated_pdfs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "templateId" TEXT,
    "styleId" TEXT,
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL DEFAULT '1.0',
    "generatedBy" TEXT NOT NULL,
    "generationParams" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "generated_pdfs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "generated_pdfs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "generated_pdfs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "invoice_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "generated_pdfs_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "invoice_styles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "invoice_templates_organizationId_idx" ON "invoice_templates"("organizationId");

-- CreateIndex
CREATE INDEX "invoice_templates_templateType_idx" ON "invoice_templates"("templateType");

-- CreateIndex
CREATE INDEX "invoice_templates_isDefault_idx" ON "invoice_templates"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_templates_organizationId_name_key" ON "invoice_templates"("organizationId", "name");

-- CreateIndex
CREATE INDEX "invoice_styles_organizationId_idx" ON "invoice_styles"("organizationId");

-- CreateIndex
CREATE INDEX "invoice_styles_templateId_idx" ON "invoice_styles"("templateId");

-- CreateIndex
CREATE INDEX "invoice_styles_isDefault_idx" ON "invoice_styles"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_styles_organizationId_name_key" ON "invoice_styles"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_branding_organizationId_key" ON "organization_branding"("organizationId");

-- CreateIndex
CREATE INDEX "generated_pdfs_organizationId_idx" ON "generated_pdfs"("organizationId");

-- CreateIndex
CREATE INDEX "generated_pdfs_invoiceId_idx" ON "generated_pdfs"("invoiceId");

-- CreateIndex
CREATE INDEX "generated_pdfs_createdAt_idx" ON "generated_pdfs"("createdAt");

-- CreateIndex
CREATE INDEX "generated_pdfs_status_idx" ON "generated_pdfs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "generated_pdfs_invoiceId_templateId_styleId_key" ON "generated_pdfs"("invoiceId", "templateId", "styleId");
