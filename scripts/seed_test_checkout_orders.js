/**
 * Script tạo các đơn hợp đồng kiểm thử tại chi nhánh Võ Nguyên Giáp:
 * 1. Trả kho ngày hôm nay (28/10/2026 - đúng hạn)
 * 2. Trả kho sớm trước hạn (hợp đồng đến tháng 4/2027 nhưng xin trả sớm)
 * 3. Trả kho trễ hạn / Quá hạn (hết hạn từ 20/10/2026, quá hạn 8 ngày, có phạt trễ hạn)
 * 4. Đơn trả kho mới (29/10/2026 - Ô VNG-MINI-02)
 */
const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  const facilityId = '6ac4ea732f3017f8106ae7a6'; // Kho Tự Quản Trụ Sở Chính Võ Nguyên Giáp
  const customerId = '6ac4e8ae2edd770fa05d7268'; // Nguyễn Văn Khách Hàng (customer@selfstorage.vn)
  const staffId = '6ac4e8ad2edd770fa05d7267'; // Nguyễn Văn Staff

  console.log('--- KHỞI TẠO CÁC ĐƠN HỢP ĐỒNG TEST TRẢ KHO TẠI CHI NHÁNH VÕ NGUYÊN GIÁP ---');

  // Dọn dẹp dữ liệu cũ nếu đã tồn tại
  const oldCodes = [
    'CON-20261028-TODAY',
    'CON-20261028-EARLY',
    'CON-20261028-OVERDUE',
    'CON-20261029-CHECKOUT',
  ];
  for (const code of oldCodes) {
    const existing = await prisma.rentalContract.findUnique({
      where: { contractCode: code },
      include: { contractItems: true, overdueRecords: true },
    });
    if (existing) {
      await prisma.overdueRecord.deleteMany({ where: { contractId: existing.id } });
      for (const item of existing.contractItems) {
        await prisma.handoverRecord.deleteMany({ where: { contractItemId: item.id } });
      }
      await prisma.contractItem.deleteMany({ where: { contractId: existing.id } });
      await prisma.rentalContract.delete({ where: { id: existing.id } });
      await prisma.reservationItem.deleteMany({
        where: { reservation: { reservationCode: 'RSV-' + code } },
      });
      await prisma.reservation.deleteMany({ where: { reservationCode: 'RSV-' + code } });
    }
  }

  // =========================================================================
  // 1. ĐƠN 1: TRẢ KHO NGÀY HÔM NAY (Đúng hạn)
  // =========================================================================
  const unitToday = await prisma.storageUnit.findFirst({
    where: { unitNumber: 'STD_1-02', facilityId },
  });
  if (!unitToday) throw new Error('Unit STD_1-02 not found');

  const rsvToday = await prisma.reservation.create({
    data: {
      reservationCode: 'RSV-CON-20261028-TODAY',
      customerId,
      facilityId,
      rentalPeriod: 1,
      rentalPeriodUnit: 'MONTHS',
      appointmentDate: new Date('2026-09-28T08:00:00Z'),
      status: 'COMPLETED',
      totalAmount: 1000000,
      items: {
        create: {
          unitId: unitToday.id,
          unitTypeId: unitToday.unitTypeId,
          price: 1000000,
          depositAmount: 1000000,
        },
      },
    },
  });

  const conToday = await prisma.rentalContract.create({
    data: {
      contractCode: 'CON-20261028-TODAY',
      reservationId: rsvToday.id,
      customerId,
      startDate: new Date('2026-09-28T08:00:00Z'),
      endDate: new Date('2026-10-28T17:00:00Z'), // Đúng hạn hôm nay
      status: 'ACTIVE',
      signedAt: new Date('2026-09-28T08:30:00Z'),
      contractItems: {
        create: {
          unitId: unitToday.id,
          rentalPrice: 1000000,
          depositAmount: 1000000,
          accessCode: '821301',
          accessCodeStatus: 'ACTIVE',
          status: 'ACTIVE',
          handoverRecords: {
            create: {
              staffId,
              type: 'CHECK_IN',
              condition: 'Kho tiêu chuẩn mới 100%, sàn sạch, khóa PIN điện tử hoạt động tốt',
              inspectionDate: new Date('2026-09-28T09:00:00Z'),
              photos: [
                'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1595246140625-573b715d11dc?w=800&auto=format&fit=crop&q=80',
              ],
            },
          },
        },
      },
    },
  });
  await prisma.storageUnit.update({ where: { id: unitToday.id }, data: { status: 'OCCUPIED' } });
  console.log('✔ [1/4] Đã tạo hợp đồng TRẢ KHO HÔM NAY: ' + conToday.contractCode + ' (Ô ' + unitToday.unitNumber + ')');

  // =========================================================================
  // 2. ĐƠN 2: TRẢ KHO SỚM TRƯỚC HẠN
  // =========================================================================
  const unitEarly = await prisma.storageUnit.findFirst({
    where: { unitNumber: 'LARGE_1-02', facilityId },
  });
  if (!unitEarly) throw new Error('Unit LARGE_1-02 not found');

  const rsvEarly = await prisma.reservation.create({
    data: {
      reservationCode: 'RSV-CON-20261028-EARLY',
      customerId,
      facilityId,
      rentalPeriod: 6,
      rentalPeriodUnit: 'MONTHS',
      appointmentDate: new Date('2026-10-01T08:00:00Z'),
      status: 'COMPLETED',
      totalAmount: 12000000,
      items: {
        create: {
          unitId: unitEarly.id,
          unitTypeId: unitEarly.unitTypeId,
          price: 2000000,
          depositAmount: 2000000,
        },
      },
    },
  });

  const conEarly = await prisma.rentalContract.create({
    data: {
      contractCode: 'CON-20261028-EARLY',
      reservationId: rsvEarly.id,
      customerId,
      startDate: new Date('2026-10-01T08:00:00Z'),
      endDate: new Date('2027-04-01T17:00:00Z'), // Hạn đến 01/04/2027 (còn hơn 5 tháng)
      status: 'ACTIVE',
      signedAt: new Date('2026-10-01T08:30:00Z'),
      contractItems: {
        create: {
          unitId: unitEarly.id,
          rentalPrice: 2000000,
          depositAmount: 2000000,
          accessCode: '945620',
          accessCodeStatus: 'ACTIVE',
          status: 'ACTIVE',
          handoverRecords: {
            create: {
              staffId,
              type: 'CHECK_IN',
              condition: 'Kho Doanh Nghiệp 20m3 sạch sẽ, cửa cuốn khóa điện tử hoạt động hoàn hảo',
              inspectionDate: new Date('2026-10-01T09:00:00Z'),
              photos: [
                'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=80',
              ],
            },
          },
        },
      },
    },
  });
  await prisma.storageUnit.update({ where: { id: unitEarly.id }, data: { status: 'OCCUPIED' } });
  console.log('✔ [2/4] Đã tạo hợp đồng TRẢ KHO SỚM: ' + conEarly.contractCode + ' (Ô ' + unitEarly.unitNumber + ')');

  // =========================================================================
  // 3. ĐƠN 3: TRẢ KHO TRỄ HẸN (Quá hạn 8 ngày)
  // =========================================================================
  const unitOverdue = await prisma.storageUnit.findFirst({
    where: { unitNumber: 'VNG-MINI-01', facilityId },
  });
  if (!unitOverdue) throw new Error('Unit VNG-MINI-01 not found');

  const rsvOverdue = await prisma.reservation.create({
    data: {
      reservationCode: 'RSV-CON-20261028-OVERDUE',
      customerId,
      facilityId,
      rentalPeriod: 1,
      rentalPeriodUnit: 'MONTHS',
      appointmentDate: new Date('2026-09-10T08:00:00Z'),
      status: 'COMPLETED',
      totalAmount: 600000,
      items: {
        create: {
          unitId: unitOverdue.id,
          unitTypeId: unitOverdue.unitTypeId,
          price: 600000,
          depositAmount: 500000,
        },
      },
    },
  });

  const conOverdue = await prisma.rentalContract.create({
    data: {
      contractCode: 'CON-20261028-OVERDUE',
      reservationId: rsvOverdue.id,
      customerId,
      startDate: new Date('2026-09-10T08:00:00Z'),
      endDate: new Date('2026-10-20T17:00:00Z'), // Hết hạn ngày 20/10/2026 (quá hạn 8 ngày)
      status: 'OVERDUE',
      signedAt: new Date('2026-09-10T08:30:00Z'),
      contractItems: {
        create: {
          unitId: unitOverdue.id,
          rentalPrice: 600000,
          depositAmount: 500000,
          accessCode: '314902',
          accessCodeStatus: 'REVOKED', // Khóa Smart Lock bị thu hồi do quá hạn
          status: 'ACTIVE',
          handoverRecords: {
            create: {
              staffId,
              type: 'CHECK_IN',
              condition: 'Kho mini sạch sẽ, đã bàn giao thẻ và hướng dẫn mã số PIN',
              inspectionDate: new Date('2026-09-10T09:00:00Z'),
              photos: [
                'https://images.unsplash.com/photo-1595246140625-573b715d11dc?w=800&auto=format&fit=crop&q=80',
              ],
            },
          },
        },
      },
      overdueRecords: {
        create: {
          overdueStartDate: new Date('2026-10-20T17:00:00Z'),
          overdueDays: 8,
          overdueFee: 240000, // (600.000 / 30) * 1.5 * 8 = 240.000 VNĐ
          status: 'OPEN',
        },
      },
    },
  });
  await prisma.storageUnit.update({ where: { id: unitOverdue.id }, data: { status: 'OCCUPIED' } });
  console.log('✔ [3/4] Đã tạo hợp đồng TRẢ KHO TRỄ HẸN (OVERDUE): ' + conOverdue.contractCode + ' (Ô ' + unitOverdue.unitNumber + ')');

  // =========================================================================
  // 4. ĐƠN 4: ĐƠN TRẢ KHO MỚI (Yêu cầu trả kho ngày 29/10/2026)
  // =========================================================================
  const unitNew = await prisma.storageUnit.findFirst({
    where: { unitNumber: 'VNG-MINI-02', facilityId },
  });
  if (!unitNew) throw new Error('Unit VNG-MINI-02 not found');

  const rsvNew = await prisma.reservation.create({
    data: {
      reservationCode: 'RSV-CON-20261029-CHECKOUT',
      customerId,
      facilityId,
      rentalPeriod: 1,
      rentalPeriodUnit: 'MONTHS',
      appointmentDate: new Date('2026-09-29T08:00:00Z'),
      status: 'COMPLETED',
      totalAmount: 500000,
      items: {
        create: {
          unitId: unitNew.id,
          unitTypeId: unitNew.unitTypeId,
          price: 500000,
          depositAmount: 500000,
        },
      },
    },
  });

  const conNew = await prisma.rentalContract.create({
    data: {
      contractCode: 'CON-20261029-CHECKOUT',
      reservationId: rsvNew.id,
      customerId,
      startDate: new Date('2026-09-29T08:00:00Z'),
      endDate: new Date('2026-10-29T17:00:00Z'), // Kết thúc ngày 29/10/2026
      status: 'ACTIVE',
      signedAt: new Date('2026-09-29T08:30:00Z'),
      contractItems: {
        create: {
          unitId: unitNew.id,
          rentalPrice: 500000,
          depositAmount: 500000,
          accessCode: '552109',
          accessCodeStatus: 'ACTIVE',
          status: 'ACTIVE',
          handoverRecords: {
            create: {
              staffId,
              type: 'CHECK_IN',
              condition: 'Kho mini 2m2 sàn sạch sẽ, bóng đèn hoạt động tốt, mã số PIN đã kích hoạt',
              inspectionDate: new Date('2026-09-29T09:00:00Z'),
              photos: [
                'https://images.unsplash.com/photo-1595246140625-573b715d11dc?w=800&auto=format&fit=crop&q=80',
              ],
            },
          },
        },
      },
    },
  });
  await prisma.storageUnit.update({ where: { id: unitNew.id }, data: { status: 'OCCUPIED' } });
  console.log('✔ [4/4] Đã tạo hợp đồng TRẢ KHO MỚI: ' + conNew.contractCode + ' (Ô ' + unitNew.unitNumber + ')');

  console.log('--- HOÀN TẤT KHỞI TẠO 4 HỢP ĐỒNG KIỂM THỬ ---');
  process.exit(0);
}

seed().catch((e) => {
  console.error('Lỗi khởi tạo test contracts:', e);
  process.exit(1);
});
