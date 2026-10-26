const { PrismaClient, StorageUnitStatus } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const facilityId = '6ac4ea732f3017f8106ae7a6'; // Kho Võ Nguyên Giáp
  const unitTypeId = '6ac4ea762f3017f8106ae7b4'; // TYPE_MINI_1 (Kho Mini Cá Nhân 1 - 2 CBM)

  // 1. Ensure UnitType has deposit 20,000 and PricingRule 20,000
  await prisma.storageUnitType.update({
    where: { id: unitTypeId },
    data: {
      depositAmount: 20000,
    }
  });

  // Ensure latest pricing rule is 20,000
  const existingRules = await prisma.pricingRule.findMany({
    where: { unitTypeId },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (existingRules.length > 0) {
    await prisma.pricingRule.update({
      where: { id: existingRules[0].id },
      data: { price: 20000 }
    });
  } else {
    await prisma.pricingRule.create({
      data: {
        unitTypeId,
        price: 20000,
        effectiveFrom: new Date(),
      }
    });
  }

  // 2. Insert 10 AVAILABLE units: VNG-MINI-01 to VNG-MINI-10
  const unitNames = [
    'VNG-MINI-01', 'VNG-MINI-02', 'VNG-MINI-03', 'VNG-MINI-04', 'VNG-MINI-05',
    'VNG-MINI-06', 'VNG-MINI-07', 'VNG-MINI-08', 'VNG-MINI-09', 'VNG-MINI-10'
  ];

  console.log('Inserting / updating 10 mini units for Co So Vo Nguyen Giap...');

  for (const name of unitNames) {
    const existing = await prisma.storageUnit.findFirst({
      where: {
        facilityId,
        unitNumber: name
      }
    });

    if (existing) {
      await prisma.storageUnit.update({
        where: { id: existing.id },
        data: {
          unitTypeId,
          status: StorageUnitStatus.AVAILABLE,
          condition: 'GOOD',
          floor: 'Tầng 1'
        }
      });
      console.log(`Updated ${name} to AVAILABLE`);
    } else {
      await prisma.storageUnit.create({
        data: {
          facilityId,
          unitTypeId,
          unitNumber: name,
          floor: 'Tầng 1',
          status: StorageUnitStatus.AVAILABLE,
          condition: 'GOOD'
        }
      });
      console.log(`Created ${name} as AVAILABLE`);
    }
  }

  // Also make sure VNG-101 is available or reset if needed, but let's check
  const availableCount = await prisma.storageUnit.count({
    where: {
      facilityId,
      unitTypeId,
      status: StorageUnitStatus.AVAILABLE
    }
  });

  console.log(`\nSUCCESS! Currently ${availableCount} mini units AVAILABLE in Vo Nguyen Giap for testing.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
