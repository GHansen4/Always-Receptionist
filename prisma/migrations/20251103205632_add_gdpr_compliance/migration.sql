-- CreateTable
CREATE TABLE "GdprRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "ordersRequested" TEXT[],
    "customerId" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GdprRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GdprRequest_shop_idx" ON "GdprRequest"("shop");

-- CreateIndex
CREATE INDEX "GdprRequest_requestType_idx" ON "GdprRequest"("requestType");

-- CreateIndex
CREATE INDEX "GdprRequest_status_idx" ON "GdprRequest"("status");
