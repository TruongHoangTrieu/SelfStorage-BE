-- AlterTable
ALTER TABLE "facilities" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "support_requests" ADD COLUMN     "photos" JSONB;

-- CreateTable
CREATE TABLE "stored_items" (
    "id" SERIAL NOT NULL,
    "contract_item_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "photo_url" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stored_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_access_logs" (
    "id" SERIAL NOT NULL,
    "contract_item_id" INTEGER NOT NULL,
    "access_code" TEXT,
    "access_method" TEXT NOT NULL DEFAULT 'PIN_CODE',
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "notes" TEXT,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_items_contract_item_id_idx" ON "stored_items"("contract_item_id");

-- CreateIndex
CREATE INDEX "unit_access_logs_contract_item_id_idx" ON "unit_access_logs"("contract_item_id");

-- CreateIndex
CREATE INDEX "unit_access_logs_accessed_at_idx" ON "unit_access_logs"("accessed_at");

-- AddForeignKey
ALTER TABLE "stored_items" ADD CONSTRAINT "stored_items_contract_item_id_fkey" FOREIGN KEY ("contract_item_id") REFERENCES "contract_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_access_logs" ADD CONSTRAINT "unit_access_logs_contract_item_id_fkey" FOREIGN KEY ("contract_item_id") REFERENCES "contract_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
