const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING STAFF ACCOUNTS SETUP ---');

  const staffRole = await prisma.role.findUnique({ where: { name: 'FACILITY_STAFF' } });
  const managerRole = await prisma.role.findUnique({ where: { name: 'FACILITY_MANAGER' } });
  const customerRole = await prisma.role.findUnique({ where: { name: 'STORAGE_CUSTOMER' } });

  if (!staffRole || !managerRole) {
    console.error('Roles not found!');
    return;
  }

  const defaultPasswordHash = await bcrypt.hash('123456', 10);

  const facilities = await prisma.facility.findMany();
  const getFacilityId = (idx) => facilities[idx]?.id || facilities[0]?.id;

  // List of staff accounts to create/assign
  const staffConfigs = [
    {
      email: 'staff@selfstorage.vn',
      fullName: 'Nguyễn Văn Staff (Trụ sở Thủ Đức)',
      phone: '0907654321',
      facilityIndex: 0, // Trụ sở chính Thủ Đức
      roleId: staffRole.id,
      position: 'Nhân viên vận hành kho',
    },
    {
      email: 'staff.thuduc@selfstorage.vn',
      fullName: 'Trần Văn Thủ Đức (NV Võ Nguyên Giáp)',
      phone: '0907654322',
      facilityIndex: 0, // Trụ sở chính Thủ Đức
      roleId: staffRole.id,
      position: 'Nhân viên vận hành kho',
    },
    {
      email: 'manager@selfstorage.vn',
      fullName: 'Phạm Thị Quản Lý (Quản lý Thủ Đức)',
      phone: '0901234567',
      facilityIndex: 0, // Trụ sở chính Thủ Đức
      roleId: managerRole.id,
      position: 'Quản lý cơ sở kho',
    },
    {
      email: 'staff.quan1@selfstorage.vn',
      fullName: 'Lê Hoàng Nam (NV Chi nhánh Quận 1)',
      phone: '0903111222',
      facilityIndex: 2, // Quận 1
      roleId: staffRole.id,
      position: 'Nhân viên vận hành kho',
    },
    {
      email: 'staff.quan7@selfstorage.vn',
      fullName: 'Đặng Quốc Bảo (NV Chi nhánh Quận 7)',
      phone: '0903333444',
      facilityIndex: 3, // Quận 7
      roleId: staffRole.id,
      position: 'Nhân viên vận hành kho',
    },
    {
      email: 'staff.binhthanh@selfstorage.vn',
      fullName: 'Vũ Minh Anh (NV Chi nhánh Bình Thạnh)',
      phone: '0903555666',
      facilityIndex: 4, // Bình Thạnh
      roleId: staffRole.id,
      position: 'Nhân viên vận hành kho',
    },
    {
      email: 'staff.quan6@selfstorage.vn',
      fullName: 'Huỳnh Gia Huy (NV Chi nhánh Quận 6)',
      phone: '0903777888',
      facilityIndex: 5, // Quận 6
      roleId: staffRole.id,
      position: 'Nhân viên vận hành kho',
    },
    {
      email: 'staff.anphu@selfstorage.vn',
      fullName: 'Ngô Tấn Tài (NV Chi nhánh An Phú)',
      phone: '0903999000',
      facilityIndex: 1, // An Phú
      roleId: staffRole.id,
      position: 'Nhân viên vận hành kho',
    },
  ];

  for (const item of staffConfigs) {
    const assignedFacilityId = getFacilityId(item.facilityIndex);

    // 1. Upsert User
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: {
        fullName: item.fullName,
        phone: item.phone,
        roleId: item.roleId,
        passwordHash: defaultPasswordHash,
        status: 'ACTIVE',
      },
      create: {
        email: item.email,
        fullName: item.fullName,
        phone: item.phone,
        roleId: item.roleId,
        passwordHash: defaultPasswordHash,
        status: 'ACTIVE',
      },
    });

    if (!assignedFacilityId) {
      console.log(`[SKIP ASSIGN] No facility available for ${user.email}`);
      continue;
    }

    // 2. Ensure StaffFacilityAssignment
    const existingAssignment = await prisma.staffFacilityAssignment.findFirst({
      where: {
        userId: user.id,
        facilityId: assignedFacilityId,
        endedAt: null,
      },
    });

    if (!existingAssignment) {
      // End any other active assignments for this user
      await prisma.staffFacilityAssignment.updateMany({
        where: { userId: user.id, endedAt: null },
        data: { endedAt: new Date() },
      });

      await prisma.staffFacilityAssignment.create({
        data: {
          userId: user.id,
          facilityId: assignedFacilityId,
          position: item.position,
          assignedAt: new Date(),
          endedAt: null,
        },
      });
      console.log(`[ASSIGNED] User ${user.email} (ID: ${user.id}) -> Facility ${assignedFacilityId}`);
    } else {
      console.log(`[EXISTING] User ${user.email} (ID: ${user.id}) already assigned to Facility ${assignedFacilityId}`);
    }
  }

  // 3. Ensure test customer exists
  let customer = await prisma.user.findUnique({ where: { email: 'customer@selfstorage.vn' } });
  if (!customer) {
    customer = await prisma.user.create({
      data: {
        email: 'customer@selfstorage.vn',
        fullName: 'Nguyễn Văn Khách Hàng',
        phone: '0912345678',
        roleId: customerRole.id,
        passwordHash: defaultPasswordHash,
        status: 'ACTIVE',
      },
    });
  }

  // 4. Ensure each facility has at least 1 sample pending/confirmed reservation for check-in demo
  const allFacilities = await prisma.facility.findMany();
  for (const fac of allFacilities) {
    const existingRes = await prisma.reservation.count({ where: { facilityId: fac.id, status: { in: ['PENDING', 'CONFIRMED'] } } });
    if (existingRes === 0) {
      // Find an available unit in this facility
      const unit = await prisma.storageUnit.findFirst({
        where: { facilityId: fac.id },
        include: { unitType: true },
      });

      if (unit) {
        const resCode = `RES-${fac.code}-${Date.now().toString().slice(-4)}`;
        const appointmentDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

        await prisma.reservation.create({
          data: {
            reservationCode: resCode,
            facilityId: fac.id,
            customerId: customer.id,
            appointmentDate,
            rentalPeriod: 1,
            rentalPeriodUnit: 'MONTHS',
            status: 'CONFIRMED',
            totalAmount: unit.unitType.depositAmount,
            items: {
              create: {
                unitTypeId: unit.unitTypeId,
                unitId: unit.id,
                price: 1500000,
                depositAmount: unit.unitType.depositAmount,
              },
            },
          },
        });
        console.log(`[SAMPLE RESERVATION] Created reservation ${resCode} for Facility ${fac.id} (${fac.name})`);
      }
    }
  }

  console.log('--- ALL STAFF ACCOUNTS & ASSIGNMENTS CREATED SUCCESSFULLY ---');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error during setup:', err);
  process.exit(1);
});
