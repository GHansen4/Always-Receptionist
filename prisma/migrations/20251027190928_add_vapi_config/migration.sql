-- CreateTable
CREATE TABLE "VapiConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "vapiSignature" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VapiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VapiConfig_shop_key" ON "VapiConfig"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "VapiConfig_vapiSignature_key" ON "VapiConfig"("vapiSignature");
