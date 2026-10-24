/**
 * Script seed dữ liệu ban đầu cho AI Assistant vào MongoDB:
 * 1. 125 món đồ vật kèm kích thước vào collection `item_catalog`
 * 2. Tài liệu chính sách quy định vào collection `knowledge_chunks`
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('--- BẮT ĐẦU SEED DỮ LIỆU AI ASSISTANT VÀO MONGODB ---');

  // 1. Seed Item Catalog
  const csvPath = path.join(__dirname, '..', 'ai-service', 'data', 'item_catalog.csv');
  if (fs.existsSync(csvPath)) {
    const raw = fs.readFileSync(csvPath, 'utf-8');
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const headers = lines[0].split(',');

    let itemCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 7) continue;

      const name = parts[0].trim();
      const aliases = parts[1] ? parts[1].split(';').map((a) => a.trim()).filter(Boolean) : [];
      const category = parts[2].trim();
      const lengthCm = parseFloat(parts[3]);
      const widthCm = parseFloat(parts[4]);
      const heightCm = parseFloat(parts[5]);
      const stackable = parts[6].trim().toLowerCase() === 'true';
      const volumeM3 = Math.round((lengthCm * widthCm * heightCm) / 1000000 * 10000) / 10000;

      await prisma.itemCatalog.upsert({
        where: { name },
        update: { aliases, category, lengthCm, widthCm, heightCm, volumeM3, stackable },
        create: { name, aliases, category, lengthCm, widthCm, heightCm, volumeM3, stackable },
      });
      itemCount++;
    }
    console.log(`✔ Đã upsert ${itemCount} món đồ vật vào collection 'item_catalog'`);
  }

  // 2. Seed Policy Chunks
  const policiesPath = path.join(__dirname, '..', 'ai-service', 'data', 'policies.txt');
  if (fs.existsSync(policiesPath)) {
    await prisma.knowledgeChunk.deleteMany({});
    const content = fs.readFileSync(policiesPath, 'utf-8');
    const blocks = content.split(/^---\s*$/m);

    let chunkCount = 0;
    for (const b of blocks) {
      const trimmed = b.trim();
      if (!trimmed) continue;

      const docMatch = trimmed.match(/\[DOCUMENT:\s*([^\]]+)\]/);
      const secMatch = trimmed.match(/\[SECTION:\s*([^\]]+)\]/);

      const documentName = docMatch ? docMatch[1].trim() : 'Chinh_Sach_Chung';
      const section = secMatch ? secMatch[1].trim() : 'Dieu_Khoan';
      const cleanContent = trimmed
        .replace(/\[DOCUMENT:[^\]]+\]/g, '')
        .replace(/\[SECTION:[^\]]+\]/g, '')
        .trim();

      if (cleanContent.length > 20) {
        await prisma.knowledgeChunk.create({
          data: {
            documentName,
            section,
            content: cleanContent,
            embedding: [],
          },
        });
        chunkCount++;
      }
    }
    console.log(`✔ Đã nạp ${chunkCount} đoạn tài liệu vào collection 'knowledge_chunks'`);
  }

  console.log('--- HOÀN TẤT SEED DỮ LIỆU AI ASSISTANT ---');
}

main()
  .catch((e) => {
    console.error('Lỗi seed dữ liệu AI:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
