const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedCustomerData() {
  console.log('--- START SEEDING RICH CUSTOMER DATA ---');

  // Customer 4: hai.nguyen@example.com
  const customer = await prisma.user.findUnique({ where: { id: 4 } });
  if (!customer) {
    console.error('Customer id 4 not found!');
    return;
  }

  // 1. Kiểm tra Contract 2 (Unit A-101)
  const contract2 = await prisma.rentalContract.findUnique({
    where: { id: 2 },
    include: { contractItems: true },
  });

  if (contract2 && contract2.contractItems.length > 0) {
    const ci1 = contract2.contractItems[0];
    console.log('Contract 2 Item ID:', ci1.id);

    // Seed payments for Contract 2
    await prisma.payment.deleteMany({ where: { contractId: 2 } });
    await prisma.payment.createMany({
      data: [
        {
          contractId: 2,
          paymentCode: 'SSDEP-JZ0F18',
          amount: 890000,
          paymentType: 'DEPOSIT',
          paymentMethod: 'BANK_TRANSFER',
          status: 'PAID',
          paidAt: new Date('2026-10-13T09:00:00Z'),
          transactionReference: 'Tiền cọc bảo đảm hợp đồng CON-20261013-JZ0F18 (Ô A-101)',
        },
        {
          contractId: 2,
          paymentCode: 'SSRENT-JZ0F18',
          amount: 890000,
          paymentType: 'RENTAL',
          paymentMethod: 'BANK_TRANSFER',
          status: 'PAID',
          paidAt: new Date('2026-10-13T09:05:00Z'),
          transactionReference: 'Tiền thuê kỳ đầu (13/10/2026 - 13/11/2026)',
        },
      ],
    });
    console.log('✓ Payments for Contract 2 created');

    // Seed Stored Items for Contract 2
    await prisma.storedItem.deleteMany({ where: { contractItemId: ci1.id } });
    await prisma.storedItem.createMany({
      data: [
        {
          contractItemId: ci1.id,
          name: 'Tủ lạnh mini Aqua 90L',
          category: 'Thiết bị gia dụng',
          quantity: 1,
          description: 'Tủ lạnh mini còn mới 95%, bọc màng co bảo vệ',
        },
        {
          contractItemId: ci1.id,
          name: 'Vali du lịch Samsonite 28 inch',
          category: 'Hành lý & Đồ dùng',
          quantity: 2,
          description: 'Vali khóa số chứa đồ mùa đông và chăn ga',
        },
        {
          contractItemId: ci1.id,
          name: 'Thùng tài liệu lưu trữ hồ sơ công ty',
          category: 'Hồ sơ & Tài liệu',
          quantity: 5,
          description: 'Hồ sơ chứng từ kế toán đóng thùng carton chuẩn',
        },
      ],
    });
    console.log('✓ Stored Items for Contract 2 created');

    // Seed Guest Access Codes for Contract 2
    await prisma.guestAccessCode.deleteMany({ where: { contractItemId: ci1.id } });
    const now = new Date();
    const valid3d = new Date(now);
    valid3d.setDate(valid3d.getDate() + 3);
    await prisma.guestAccessCode.create({
      data: {
        contractItemId: ci1.id,
        guestName: 'Lê Văn Hùng (Tài xế vận chuyển)',
        pinCode: '718293',
        validFrom: now,
        validTo: valid3d,
        usageType: 'multi_time',
        status: 'active',
        purpose: 'Vận chuyển tài liệu và chuyển đồ vào kho A-101',
      },
    });
    console.log('✓ Guest Access Code for Contract 2 created');
  }

  // 2. Tạo Contract thứ hai cho Customer 4: Ô B-201 (Kho Gia Đình 9m² - Tầng 2)
  let contractB201 = await prisma.rentalContract.findFirst({
    where: { customerId: 4, contractCode: 'CON-20261013-B201VIP' },
    include: { contractItems: true },
  });

  if (!contractB201) {
    // Tạo Reservation trước
    const resB201 = await prisma.reservation.create({
      data: {
        reservationCode: 'RSV-B201-9988',
        customerId: 4,
        facilityId: 1,
        appointmentDate: new Date('2026-10-13T10:00:00Z'),
        rentalPeriod: 6,
        totalAmount: 10140000,
        status: 'COMPLETED',
      },
    });

    contractB201 = await prisma.rentalContract.create({
      data: {
        contractCode: 'CON-20261013-B201VIP',
        reservationId: resB201.id,
        customerId: 4,
        startDate: new Date('2026-10-13T00:00:00Z'),
        endDate: new Date('2027-04-13T00:00:00Z'),
        status: 'ACTIVE',
        signedAt: new Date(),
      },
      include: { contractItems: true },
    });

    // Cập nhật Storage Unit 5 (B-201) thành OCCUPIED
    await prisma.storageUnit.update({
      where: { id: 5 },
      data: { status: 'OCCUPIED' },
    });

    // Tạo ContractItem cho B-201
    const ci2 = await prisma.contractItem.create({
      data: {
        contractId: contractB201.id,
        unitId: 5,
        rentalPrice: 1690000,
        depositAmount: 1690000,
        accessCode: '682914',
        accessCodeStatus: 'ACTIVE',
        status: 'ACTIVE',
      },
    });

    // Tạo payments cho B-201
    await prisma.payment.createMany({
      data: [
        {
          contractId: contractB201.id,
          paymentCode: 'SSDEP-B201VIP',
          amount: 1690000,
          paymentType: 'DEPOSIT',
          paymentMethod: 'BANK_TRANSFER',
          status: 'PAID',
          paidAt: new Date('2026-10-13T10:15:00Z'),
          transactionReference: 'Tiền cọc bảo đảm hợp đồng CON-20261013-B201VIP (Ô B-201)',
        },
        {
          contractId: contractB201.id,
          paymentCode: 'SSRENT-B201VIP',
          amount: 1690000,
          paymentType: 'RENTAL',
          paymentMethod: 'BANK_TRANSFER',
          status: 'PAID',
          paidAt: new Date('2026-10-13T10:20:00Z'),
          transactionReference: 'Tiền thuê kỳ 1 kho gia đình tiêu chuẩn 9m²',
        },
      ],
    });

    // Stored items cho B-201
    await prisma.storedItem.createMany({
      data: [
        {
          contractItemId: ci2.id,
          name: 'Bộ sofa phòng khách bọc da cao cấp',
          category: 'Nội thất gia đình',
          quantity: 1,
          description: 'Sofa góc 3 chỗ bọc bạt chống bụi',
        },
        {
          contractItemId: ci2.id,
          name: 'Dàn âm thanh rạp hát Denon 5.1',
          category: 'Thiết bị điện tử',
          quantity: 1,
          description: 'Gồm âm ly và 5 loa bọc xốp chống sốc',
        },
        {
          contractItemId: ci2.id,
          name: 'Máy giặt sấy Electrolux UltimateCare 10kg',
          category: 'Điện máy gia dụng',
          quantity: 1,
          description: 'Đã xả cạn nước, niêm phong cửa lồng giặt',
        },
      ],
    });

    // Guest code cho B-201
    const valid1d = new Date();
    valid1d.setHours(valid1d.getHours() + 24);
    await prisma.guestAccessCode.create({
      data: {
        contractItemId: ci2.id,
        guestName: 'Trần Anh Tuấn (Kỹ thuật điện lạnh)',
        pinCode: '938217',
        validFrom: new Date(),
        validTo: valid1d,
        usageType: 'one_time',
        status: 'active',
        purpose: 'Vào kiểm tra bảo trì máy giặt sấy lưu kho',
      },
    });

    console.log('✓ Contract B-201 and related items/payments created');
  }

  // 3. Support Tickets trong DB
  const existingTickets = await prisma.supportRequest.findMany({ where: { customerId: 4 } });
  if (existingTickets.length <= 1) {
    await prisma.supportRequest.create({
      data: {
        requestCode: 'TK-20261013-LIGHT',
        customerId: 4,
        facilityId: 1,
        category: 'UNIT',
        subject: 'Bóng đèn hành lang Tầng 2 chập chờn',
        description: 'Bóng đèn chiếu sáng khu B gần ô B-201 bị nhấp nháy vào buổi tối, nhờ kỹ thuật cơ sở thay bóng.',
        priority: 'MEDIUM',
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });
    console.log('✓ Second support ticket created');
  }

  console.log('--- SEEDING COMPLETED SUCCESSFULLY! ---');
}

seedCustomerData()
  .catch((err) => console.error(err))
  .finally(() => prisma.$disconnect());
