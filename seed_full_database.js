const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING FULL DATABASE SEEDING ---');

  // 1. Roles
  const roles = [
    { name: 'SYSTEM_ADMINISTRATOR', description: 'System Administrator' },
    { name: 'BUSINESS_OPERATIONS_MANAGER', description: 'Business Operations Manager' },
    { name: 'FACILITY_MANAGER', description: 'Facility Manager' },
    { name: 'FACILITY_STAFF', description: 'Facility Staff' },
    { name: 'STORAGE_CUSTOMER', description: 'Storage Customer' },
  ];

  const roleMap = {};
  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: { name: r.name, description: r.description },
    });
    roleMap[r.name] = role.id;
  }
  console.log('[1/6] Roles verified');

  const defaultPasswordHash = await bcrypt.hash('123456', 10);

  // 2. Facilities
  const facilitiesData = [
    {
      id: 1,
      name: 'SelfStorage Thủ Đức (Trụ sở Võ Nguyên Giáp)',
      code: 'SS-TD',
      address: '456 Võ Văn Ngân, Phường Linh Chiểu, TP. Thủ Đức, TP.HCM',
      phone: '02877700117',
      email: 'thuduc@selfstorage.vn',
      status: 'ACTIVE',
      images: [
        'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    {
      id: 2,
      name: 'SelfStorage An Phú (Thủ Đức)',
      code: 'SS-AP',
      address: '21 Mai Chí Thọ, Phường An Phú, TP. Thủ Đức, TP.HCM',
      phone: '02877700118',
      email: 'anphu@selfstorage.vn',
      status: 'ACTIVE',
      images: [
        'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    {
      id: 3,
      name: 'SelfStorage Quận 1 (Central Hub)',
      code: 'SS-Q1',
      address: '123 Nguyễn Thị Minh Khai, Phường Bến Thành, Quận 1, TP.HCM',
      phone: '02877700119',
      email: 'quan1@selfstorage.vn',
      status: 'ACTIVE',
      images: [
        'https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&w=1200&q=80',
      ],
    },
  ];

  for (const f of facilitiesData) {
    await prisma.facility.upsert({
      where: { code: f.code },
      update: { name: f.name, address: f.address, phone: f.phone, email: f.email, status: f.status },
      create: f,
    });
  }
  console.log('[2/6] Facilities verified');

  // 3. Storage Unit Types for Facility 1
  const unitTypesData = [
    {
      facilityId: 1,
      name: 'Kho Cá Nhân Mini (Box 4.9m²)',
      code: 'UT-MINI',
      size: 4.9,
      sizeUnit: 'm2',
      depositAmount: 890000,
      description: 'Chứa được 15-20 thùng carton, vali du lịch, tài liệu hoặc đồ đạc sinh viên.',
      status: 'ACTIVE',
    },
    {
      facilityId: 1,
      name: 'Kho Gia Đình Tiêu Chuẩn (Box 9.0m²)',
      code: 'UT-MED',
      size: 9.0,
      sizeUnit: 'm2',
      depositAmount: 1690000,
      description: 'Lý tưởng dọn nhà, chứa trọn bộ bàn ghế, sofa, tủ lạnh, nệm và máy giặt.',
      status: 'ACTIVE',
    },
    {
      facilityId: 1,
      name: 'Kho Doanh Nghiệp & TMĐT (Box 14.5m²)',
      code: 'UT-LARGE',
      size: 14.5,
      sizeUnit: 'm2',
      depositAmount: 2890000,
      description: 'Chứa hàng hóa xuất nhập khẩu, thiết bị văn phòng, pallet hàng kinh doanh.',
      status: 'ACTIVE',
    },
    {
      facilityId: 1,
      name: 'Kho Mát Bảo Quản (Climate 6.5m²)',
      code: 'UT-CLIMATE',
      size: 6.5,
      sizeUnit: 'm2',
      depositAmount: 1990000,
      description: 'Bảo quản mỹ phẩm, rượu vang, thiết bị điện tử tinh xảo (23-25°C).',
      status: 'ACTIVE',
    },
  ];

  const typeMap = {};
  for (const ut of unitTypesData) {
    const existing = await prisma.storageUnitType.findFirst({
      where: { facilityId: ut.facilityId, code: ut.code },
    });
    let record;
    if (existing) {
      record = await prisma.storageUnitType.update({
        where: { id: existing.id },
        data: ut,
      });
    } else {
      record = await prisma.storageUnitType.create({ data: ut });
    }
    typeMap[ut.code] = record.id;
  }
  console.log('[3/6] Storage Unit Types verified');

  // 4. Storage Units for Facility 1
  const unitsData = [
    { unitNumber: 'A-101', floor: 'Tầng 1', typeCode: 'UT-MINI' },
    { unitNumber: 'A-102', floor: 'Tầng 1', typeCode: 'UT-MINI' },
    { unitNumber: 'A-103', floor: 'Tầng 1', typeCode: 'UT-MINI' },
    { unitNumber: 'A-104', floor: 'Tầng 1', typeCode: 'UT-MINI' },
    { unitNumber: 'B-201', floor: 'Tầng 2', typeCode: 'UT-MED' },
    { unitNumber: 'B-202', floor: 'Tầng 2', typeCode: 'UT-MED' },
    { unitNumber: 'B-205', floor: 'Tầng 2', typeCode: 'UT-MED' },
    { unitNumber: 'B-208', floor: 'Tầng 2', typeCode: 'UT-MED' },
    { unitNumber: 'C-301', floor: 'Tầng 3', typeCode: 'UT-LARGE' },
    { unitNumber: 'C-302', floor: 'Tầng 3', typeCode: 'UT-LARGE' },
    { unitNumber: 'C-305', floor: 'Tầng 3', typeCode: 'UT-LARGE' },
    { unitNumber: 'CL-401', floor: 'Tầng 4', typeCode: 'UT-CLIMATE' },
    { unitNumber: 'CL-402', floor: 'Tầng 4', typeCode: 'UT-CLIMATE' },
  ];

  const unitMap = {};
  for (const u of unitsData) {
    const typeId = typeMap[u.typeCode];
    const existing = await prisma.storageUnit.findFirst({
      where: { facilityId: 1, unitNumber: u.unitNumber },
    });
    let record;
    if (existing) {
      record = await prisma.storageUnit.update({
        where: { id: existing.id },
        data: { floor: u.floor, unitTypeId: typeId, status: 'AVAILABLE' },
      });
    } else {
      record = await prisma.storageUnit.create({
        data: {
          facilityId: 1,
          unitNumber: u.unitNumber,
          floor: u.floor,
          unitTypeId: typeId,
          status: 'AVAILABLE',
          condition: 'Kho sạch sẽ, không hư hỏng, khóa Smart PIN tốt',
        },
      });
    }
    unitMap[u.unitNumber] = record.id;
  }
  console.log('[4/6] Storage Units created (all AVAILABLE)');

  // 5. Staff & Customer Users
  const usersToSeed = [
    {
      email: 'staff@selfstorage.vn',
      fullName: 'Nguyễn Văn Staff',
      phone: '0907654321',
      roleId: roleMap['FACILITY_STAFF'],
      isStaff: true,
      facilityId: 1,
      position: 'Nhân viên vận hành quầy',
    },
    {
      email: 'staff.thuduc@selfstorage.vn',
      fullName: 'Trần Văn Thủ Đức',
      phone: '0907654322',
      roleId: roleMap['FACILITY_STAFF'],
      isStaff: true,
      facilityId: 1,
      position: 'Nhân viên lễ tân',
    },
    {
      email: 'manager@selfstorage.vn',
      fullName: 'Phạm Thị Quản Lý',
      phone: '0901234567',
      roleId: roleMap['FACILITY_MANAGER'],
      isStaff: true,
      facilityId: 1,
      position: 'Quản lý cơ sở',
    },
    {
      email: 'hai.nguyen@example.com',
      fullName: 'Nguyễn Văn Hải',
      phone: '0908123456',
      roleId: roleMap['STORAGE_CUSTOMER'],
    },
    {
      email: 'thuha.tran@gmail.com',
      fullName: 'Trần Thị Thu Hà',
      phone: '0912345678',
      roleId: roleMap['STORAGE_CUSTOMER'],
    },
    {
      email: 'nam.le@alphalog.vn',
      fullName: 'Lê Hoàng Nam',
      phone: '0987654321',
      roleId: roleMap['STORAGE_CUSTOMER'],
    },
    {
      email: 'minhtri.vu@gmail.com',
      fullName: 'Vũ Minh Trí',
      phone: '0933222111',
      roleId: roleMap['STORAGE_CUSTOMER'],
    },
  ];

  const userMap = {};
  for (const u of usersToSeed) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        phone: u.phone,
        roleId: u.roleId,
        passwordHash: defaultPasswordHash,
        status: 'ACTIVE',
      },
      create: {
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        roleId: u.roleId,
        passwordHash: defaultPasswordHash,
        status: 'ACTIVE',
      },
    });
    userMap[u.email] = user.id;

    if (u.isStaff) {
      await prisma.staffFacilityAssignment.upsert({
        where: { id: u.facilityId * 100 + user.id },
        update: { endedAt: null },
        create: {
          id: u.facilityId * 100 + user.id,
          userId: user.id,
          facilityId: u.facilityId,
          position: u.position,
          assignedAt: new Date(),
        },
      }).catch(async () => {
        const exist = await prisma.staffFacilityAssignment.findFirst({
          where: { userId: user.id, facilityId: u.facilityId },
        });
        if (!exist) {
          await prisma.staffFacilityAssignment.create({
            data: {
              userId: user.id,
              facilityId: u.facilityId,
              position: u.position,
              assignedAt: new Date(),
            },
          });
        }
      });
    }
  }
  console.log('[5/6] Staff & Customer users seeded');

  // 6. Seed Reservations for Flow 2 (Check-in Queue)
  const reservationsToCreate = [
    {
      resCode: 'RSV-20261013-008910',
      customerEmail: 'hai.nguyen@example.com',
      unitNumber: 'A-101',
      typeCode: 'UT-MINI',
      period: 6,
      amount: 890000,
      hoursAhead: 0.5, // 30 phút nữa
      notes: 'Khách yêu cầu ô kho khô ráo, tránh ánh nắng trực tiếp.',
    },
    {
      resCode: 'RSV-20261013-008911',
      customerEmail: 'thuha.tran@gmail.com',
      unitNumber: 'B-205',
      typeCode: 'UT-MED',
      period: 12,
      amount: 1690000,
      hoursAhead: 1, // 1 giờ nữa
      notes: 'Khách cần mượn xe đẩy 4 bánh lúc chuyển đồ vào kho.',
    },
    {
      resCode: 'RSV-20261013-008912',
      customerEmail: 'nam.le@alphalog.vn',
      unitNumber: 'C-302',
      typeCode: 'UT-LARGE',
      period: 12,
      amount: 2890000,
      hoursAhead: 2, // 2 giờ nữa
      notes: 'Chứa pallet hàng phụ tùng linh kiện điện tử, cần xuất VAT.',
    },
    {
      resCode: 'RSV-20261013-008913',
      customerEmail: 'minhtri.vu@gmail.com',
      unitNumber: 'CL-401',
      typeCode: 'UT-CLIMATE',
      period: 3,
      amount: 1990000,
      hoursAhead: 3, // 3 giờ nữa
      notes: 'Bảo quản mỹ phẩm organic, cần nhiệt độ 23-25°C.',
    },
  ];

  for (const r of reservationsToCreate) {
    const custId = userMap[r.customerEmail];
    const unitId = unitMap[r.unitNumber];
    const typeId = typeMap[r.typeCode];

    const exist = await prisma.reservation.findUnique({
      where: { reservationCode: r.resCode },
    });

    if (!exist) {
      // Đặt StorageUnit sang RESERVED
      await prisma.storageUnit.update({
        where: { id: unitId },
        data: { status: 'RESERVED' },
      });

      const appointmentDate = new Date(Date.now() + r.hoursAhead * 3600 * 1000);

      await prisma.reservation.create({
        data: {
          reservationCode: r.resCode,
          facilityId: 1,
          customerId: custId,
          rentalPeriod: r.period,
          rentalPeriodUnit: 'MONTHS',
          appointmentDate,
          status: 'CONFIRMED',
          totalAmount: r.amount,
          items: {
            create: {
              unitTypeId: typeId,
              unitId: unitId,
              price: r.amount,
              depositAmount: r.amount,
            },
          },
        },
      });
      console.log(`[RESERVATION] Created ${r.resCode} for ${r.customerEmail} assigned unit ${r.unitNumber}`);
    }
  }

  console.log('--- FULL SEEDING COMPLETED SUCCESSFULLY! ---');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
