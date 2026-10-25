const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('--- UPSERTING OPERATIONS DIRECTOR (BUSINESS_OPERATIONS_MANAGER) ACCOUNTS ---');

  const opsRole = await prisma.role.findUnique({
    where: { name: 'BUSINESS_OPERATIONS_MANAGER' },
  });

  if (!opsRole) {
    console.error('Role BUSINESS_OPERATIONS_MANAGER not found in database!');
    process.exit(1);
  }

  const defaultPasswordHash = await bcrypt.hash('123456', 10);

  const opsAccounts = [
    {
      email: 'ops@selfstorage.vn',
      fullName: 'Nguyễn Vận Hành (Giám Đốc Vận Hành)',
      phone: '0908889999',
    },
    {
      email: 'giamdoc.vanhanh@selfstorage.vn',
      fullName: 'Trần Quốc Bảo (Giám Đốc Vận Hành)',
      phone: '0909998888',
    },
  ];

  for (const acc of opsAccounts) {
    const user = await prisma.user.upsert({
      where: { email: acc.email },
      update: {
        fullName: acc.fullName,
        phone: acc.phone,
        roleId: opsRole.id,
        passwordHash: defaultPasswordHash,
        status: 'ACTIVE',
      },
      create: {
        email: acc.email,
        fullName: acc.fullName,
        phone: acc.phone,
        roleId: opsRole.id,
        passwordHash: defaultPasswordHash,
        status: 'ACTIVE',
      },
      include: { role: true },
    });

    console.log(`[SUCCESS] Account: ${user.email} | Name: ${user.fullName} | Role: ${user.role.name} | Password: 123456`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error seeding ops accounts:', err);
  process.exit(1);
});
