const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');

const pgClient = new Client({
  connectionString: 'postgresql://postgres:12345@localhost:5432/self_storage_db?schema=public',
});

const prisma = new PrismaClient();

// ID mapping tables: Map<oldNumberId, newStringObjectId>
const roleMap = new Map();
const userMap = new Map();
const facilityMap = new Map();
const unitTypeMap = new Map();
const unitMap = new Map();
const reservationMap = new Map();
const contractMap = new Map();
const contractItemMap = new Map();
const feeTypeMap = new Map();
const discountMap = new Map();
const supportRequestMap = new Map();

async function main() {
  console.log('=== BẮT ĐẦU CHUYỂN DỮ LIỆU TỪ POSTGRESQL SANG MONGODB ATLAS ===\n');

  await pgClient.connect();
  console.log('[+] Đã kết nối PostgreSQL cục bộ (self_storage_db).');
  await prisma.$connect();
  console.log('[+] Đã kết nối MongoDB Atlas (selfstorage).\n');

  const toFloat = (val) => (val !== null && val !== undefined ? parseFloat(val) : 0);
  const toFloatOrNull = (val) => (val !== null && val !== undefined ? parseFloat(val) : null);

  // 1. ROLES
  console.log('--- 1. Di chuyển Roles ---');
  const pgRoles = await pgClient.query('SELECT * FROM roles ORDER BY id ASC');
  for (const r of pgRoles.rows) {
    const existing = await prisma.role.findUnique({ where: { name: r.name } });
    if (existing) {
      roleMap.set(r.id, existing.id);
    } else {
      const created = await prisma.role.create({
        data: {
          name: r.name,
          description: r.description,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        },
      });
      roleMap.set(r.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${roleMap.size} roles.`);

  // 2. USERS
  console.log('--- 2. Di chuyển Users ---');
  const pgUsers = await pgClient.query('SELECT * FROM users ORDER BY id ASC');
  for (const u of pgUsers.rows) {
    const roleId = roleMap.get(u.role_id);
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      userMap.set(u.id, existing.id);
    } else {
      const created = await prisma.user.create({
        data: {
          roleId: roleId,
          fullName: u.full_name,
          email: u.email,
          phone: u.phone,
          passwordHash: u.password_hash,
          status: u.status,
          lastLoginAt: u.last_login_at,
          createdAt: u.created_at,
          updatedAt: u.updated_at,
        },
      });
      userMap.set(u.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${userMap.size} users.`);

  // 3. FACILITIES
  console.log('--- 3. Di chuyển Facilities ---');
  const pgFacilities = await pgClient.query('SELECT * FROM facilities ORDER BY id ASC');
  for (const f of pgFacilities.rows) {
    const existing = await prisma.facility.findUnique({ where: { code: f.code } });
    if (existing) {
      facilityMap.set(f.id, existing.id);
    } else {
      const created = await prisma.facility.create({
        data: {
          name: f.name,
          code: f.code,
          description: f.description,
          phone: f.phone,
          email: f.email,
          address: f.address,
          images: f.images || [],
          status: f.status,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
        },
      });
      facilityMap.set(f.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${facilityMap.size} facilities.`);

  // 4. STAFF FACILITY ASSIGNMENTS
  console.log('--- 4. Di chuyển Staff Facility Assignments ---');
  const pgAssignments = await pgClient.query('SELECT * FROM staff_facility_assignments ORDER BY id ASC');
  let assignCount = 0;
  for (const a of pgAssignments.rows) {
    const userId = userMap.get(a.user_id);
    const facilityId = facilityMap.get(a.facility_id);
    if (userId && facilityId) {
      const existing = await prisma.staffFacilityAssignment.findFirst({
        where: { userId, facilityId, endedAt: null },
      });
      if (!existing) {
        await prisma.staffFacilityAssignment.create({
          data: {
            userId,
            facilityId,
            position: a.position,
            assignedAt: a.assigned_at,
            endedAt: a.ended_at,
            createdAt: a.created_at || new Date(),
          },
        });
        assignCount++;
      }
    }
  }
  console.log(`[OK] Đã chuyển ${assignCount} staff assignments.`);

  // 5. STORAGE UNIT TYPES
  console.log('--- 5. Di chuyển Storage Unit Types ---');
  const pgUnitTypes = await pgClient.query('SELECT * FROM storage_unit_types ORDER BY id ASC');
  for (const ut of pgUnitTypes.rows) {
    const facilityId = facilityMap.get(ut.facility_id);
    if (!facilityId) continue;
    const existing = await prisma.storageUnitType.findUnique({
      where: { facilityId_code: { facilityId, code: ut.code } },
    });
    if (existing) {
      unitTypeMap.set(ut.id, existing.id);
    } else {
      const created = await prisma.storageUnitType.create({
        data: {
          facilityId,
          name: ut.name,
          code: ut.code,
          description: ut.description,
          size: toFloat(ut.size),
          sizeUnit: ut.size_unit || 'm2',
          depositAmount: toFloat(ut.deposit_amount),
          status: ut.status,
          createdAt: ut.created_at,
          updatedAt: ut.updated_at,
        },
      });
      unitTypeMap.set(ut.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${unitTypeMap.size} storage unit types.`);

  // 6. STORAGE UNITS
  console.log('--- 6. Di chuyển Storage Units ---');
  const pgUnits = await pgClient.query('SELECT * FROM storage_units ORDER BY id ASC');
  for (const u of pgUnits.rows) {
    const facilityId = facilityMap.get(u.facility_id);
    const unitTypeId = unitTypeMap.get(u.unit_type_id);
    if (!facilityId || !unitTypeId) continue;
    const existing = await prisma.storageUnit.findUnique({
      where: { facilityId_unitNumber: { facilityId, unitNumber: u.unit_number } },
    });
    if (existing) {
      unitMap.set(u.id, existing.id);
    } else {
      const created = await prisma.storageUnit.create({
        data: {
          facilityId,
          unitTypeId,
          unitNumber: u.unit_number,
          floor: u.floor,
          status: u.status,
          condition: u.condition || 'GOOD',
          createdAt: u.created_at,
          updatedAt: u.updated_at,
        },
      });
      unitMap.set(u.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${unitMap.size} storage units.`);

  // 7. RESERVATIONS & ITEMS
  console.log('--- 7. Di chuyển Reservations ---');
  const pgReservations = await pgClient.query('SELECT * FROM reservations ORDER BY id ASC');
  for (const r of pgReservations.rows) {
    const facilityId = facilityMap.get(r.facility_id);
    const customerId = userMap.get(r.customer_id);
    if (!facilityId || !customerId) continue;

    const existing = await prisma.reservation.findUnique({
      where: { reservationCode: r.reservation_code },
    });
    if (existing) {
      reservationMap.set(r.id, existing.id);
    } else {
      const created = await prisma.reservation.create({
        data: {
          reservationCode: r.reservation_code,
          facilityId,
          customerId,
          rentalPeriod: r.rental_period,
          rentalPeriodUnit: r.rental_period_unit,
          appointmentDate: r.appointment_date,
          status: r.status,
          totalAmount: toFloat(r.total_amount),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        },
      });
      reservationMap.set(r.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${reservationMap.size} reservations.`);

  const pgResItems = await pgClient.query('SELECT * FROM reservation_items ORDER BY id ASC');
  let resItemsCount = 0;
  for (const ri of pgResItems.rows) {
    const resId = reservationMap.get(ri.reservation_id);
    const utId = unitTypeMap.get(ri.unit_type_id);
    const uId = ri.unit_id ? unitMap.get(ri.unit_id) : null;
    if (resId && utId) {
      await prisma.reservationItem.create({
        data: {
          reservationId: resId,
          unitTypeId: utId,
          unitId: uId,
          price: toFloat(ri.price),
          depositAmount: toFloat(ri.deposit_amount),
          createdAt: ri.created_at,
          updatedAt: ri.updated_at || ri.created_at,
        },
      });
      resItemsCount++;
    }
  }
  console.log(`[OK] Đã chuyển ${resItemsCount} reservation items.`);

  // 8. RENTAL CONTRACTS & ITEMS
  console.log('--- 8. Di chuyển Rental Contracts ---');
  const pgContracts = await pgClient.query('SELECT * FROM rental_contracts ORDER BY id ASC');
  for (const c of pgContracts.rows) {
    const customerId = userMap.get(c.customer_id);
    const resId = reservationMap.get(c.reservation_id);
    if (!customerId || !resId) continue;

    const existing = await prisma.rentalContract.findUnique({
      where: { contractCode: c.contract_code },
    });
    if (existing) {
      contractMap.set(c.id, existing.id);
    } else {
      const created = await prisma.rentalContract.create({
        data: {
          contractCode: c.contract_code,
          reservationId: resId,
          customerId,
          startDate: c.start_date,
          endDate: c.end_date,
          status: c.status,
          signedAt: c.signed_at,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        },
      });
      contractMap.set(c.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${contractMap.size} contracts.`);

  const pgContractItems = await pgClient.query('SELECT * FROM contract_items ORDER BY id ASC');
  for (const ci of pgContractItems.rows) {
    const contractId = contractMap.get(ci.contract_id);
    const unitId = unitMap.get(ci.unit_id);
    if (!contractId || !unitId) continue;

    const created = await prisma.contractItem.create({
      data: {
        contractId,
        unitId,
        rentalPrice: toFloat(ci.rental_price),
        depositAmount: toFloat(ci.deposit_amount),
        accessCode: ci.access_code,
        accessCodeStatus: ci.access_code_status,
        status: ci.status,
        createdAt: ci.created_at,
        updatedAt: ci.updated_at,
      },
    });
    contractItemMap.set(ci.id, created.id);
  }
  console.log(`[OK] Đã chuyển ${contractItemMap.size} contract items.`);

  // 9. HANDOVER RECORDS
  console.log('--- 9. Di chuyển Handover Records ---');
  const pgHandovers = await pgClient.query('SELECT * FROM handover_records ORDER BY id ASC');
  let handoverCount = 0;
  for (const h of pgHandovers.rows) {
    const contractItemId = contractItemMap.get(h.contract_item_id);
    const staffId = userMap.get(h.staff_id);
    if (contractItemId && staffId) {
      await prisma.handoverRecord.create({
        data: {
          contractItemId,
          staffId,
          type: h.type,
          condition: h.condition,
          notes: h.notes,
          photos: h.photos || [],
          inspectionDate: h.inspection_date,
          createdAt: h.created_at,
          updatedAt: h.updated_at,
        },
      });
      handoverCount++;
    }
  }
  console.log(`[OK] Đã chuyển ${handoverCount} handover records.`);

  // 10. PAYMENTS
  console.log('--- 10. Di chuyển Payments ---');
  const pgPayments = await pgClient.query('SELECT * FROM payments ORDER BY id ASC');
  let paymentCount = 0;
  for (const p of pgPayments.rows) {
    const resId = p.reservation_id ? reservationMap.get(p.reservation_id) : null;
    const conId = p.contract_id ? contractMap.get(p.contract_id) : null;

    const existing = await prisma.payment.findUnique({
      where: { paymentCode: p.payment_code },
    });
    if (!existing) {
      await prisma.payment.create({
        data: {
          paymentCode: p.payment_code,
          reservationId: resId,
          contractId: conId,
          paymentType: p.payment_type,
          amount: toFloat(p.amount),
          paymentMethod: p.payment_method,
          transactionReference: p.transaction_reference,
          status: p.status,
          paidAt: p.paid_at,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        },
      });
      paymentCount++;
    }
  }
  console.log(`[OK] Đã chuyển ${paymentCount} payments.`);

  // 11. POLICIES
  console.log('--- 11. Di chuyển Policies ---');
  const pgPolicies = await pgClient.query('SELECT * FROM policies ORDER BY id ASC');
  let policyCount = 0;
  for (const pol of pgPolicies.rows) {
    const facilityId = pol.facility_id ? facilityMap.get(pol.facility_id) : null;
    await prisma.policy.create({
      data: {
        facilityId,
        policyType: pol.policy_type,
        name: pol.name,
        description: pol.description,
        value: pol.value,
        valueType: pol.value_type,
        effectiveFrom: pol.effective_from,
        effectiveTo: pol.effective_to,
        status: pol.status,
        createdAt: pol.created_at,
        updatedAt: pol.updated_at,
      },
    });
    policyCount++;
  }
  console.log(`[OK] Đã chuyển ${policyCount} policies.`);

  // 12. PRICING RULES
  console.log('--- 12. Di chuyển Pricing Rules ---');
  const pgPricing = await pgClient.query('SELECT * FROM pricing_rules ORDER BY id ASC');
  let pricingCount = 0;
  for (const pr of pgPricing.rows) {
    const unitTypeId = unitTypeMap.get(pr.unit_type_id);
    if (!unitTypeId) continue;
    await prisma.pricingRule.create({
      data: {
        unitTypeId,
        price: toFloat(pr.price),
        effectiveFrom: pr.effective_from,
        effectiveTo: pr.effective_to,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      },
    });
    pricingCount++;
  }
  console.log(`[OK] Đã chuyển ${pricingCount} pricing rules.`);

  // 13. FEE TYPES & EXTRA CHARGES
  console.log('--- 13. Di chuyển Fee Types & Extra Charges ---');
  const pgFeeTypes = await pgClient.query('SELECT * FROM fee_types ORDER BY id ASC');
  for (const ft of pgFeeTypes.rows) {
    const existing = await prisma.feeType.findUnique({ where: { code: ft.code } });
    if (existing) {
      feeTypeMap.set(ft.id, existing.id);
    } else {
      const created = await prisma.feeType.create({
        data: {
          name: ft.name,
          code: ft.code,
          description: ft.description,
          defaultAmount: toFloat(ft.default_amount),
          amountType: ft.amount_type,
          appliesTo: ft.applies_to,
          status: ft.status,
          createdAt: ft.created_at,
          updatedAt: ft.updated_at,
        },
      });
      feeTypeMap.set(ft.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${feeTypeMap.size} fee types.`);

  const pgExtraCharges = await pgClient.query('SELECT * FROM extra_charges ORDER BY id ASC');
  let extraChargeCount = 0;
  for (const ec of pgExtraCharges.rows) {
    const contractId = ec.contract_id ? contractMap.get(ec.contract_id) : null;
    const reservationId = ec.reservation_id ? reservationMap.get(ec.reservation_id) : null;
    const feeTypeId = feeTypeMap.get(ec.fee_type_id);
    const createdBy = userMap.get(ec.created_by);
    if (feeTypeId && createdBy) {
      await prisma.extraCharge.create({
        data: {
          contractId,
          reservationId,
          feeTypeId,
          amount: toFloat(ec.amount),
          reason: ec.reason,
          status: ec.status,
          createdBy,
          createdAt: ec.created_at,
          updatedAt: ec.updated_at,
        },
      });
      extraChargeCount++;
    }
  }
  console.log(`[OK] Đã chuyển ${extraChargeCount} extra charges.`);

  // 14. DISCOUNTS & USAGES
  console.log('--- 14. Di chuyển Discounts ---');
  const pgDiscounts = await pgClient.query('SELECT * FROM discounts ORDER BY id ASC');
  for (const d of pgDiscounts.rows) {
    const existing = await prisma.discount.findUnique({ where: { code: d.code } });
    if (existing) {
      discountMap.set(d.id, existing.id);
    } else {
      const created = await prisma.discount.create({
        data: {
          code: d.code,
          name: d.name,
          description: d.description,
          discountType: d.discount_type,
          value: toFloat(d.value),
          startDate: d.start_date,
          endDate: d.end_date,
          maxUsage: d.max_usage,
          status: d.status,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        },
      });
      discountMap.set(d.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${discountMap.size} discounts.`);

  const pgDiscountUsages = await pgClient.query('SELECT * FROM discount_usages ORDER BY id ASC');
  let discountUsageCount = 0;
  for (const du of pgDiscountUsages.rows) {
    const discountId = discountMap.get(du.discount_id);
    const reservationId = du.reservation_id ? reservationMap.get(du.reservation_id) : null;
    const contractId = du.contract_id ? contractMap.get(du.contract_id) : null;
    const appliedBy = du.applied_by ? userMap.get(du.applied_by) : null;
    if (discountId) {
      await prisma.discountUsage.create({
        data: {
          discountId,
          reservationId,
          contractId,
          appliedAmount: toFloat(du.applied_amount),
          appliedBy,
          createdAt: du.created_at,
        },
      });
      discountUsageCount++;
    }
  }
  console.log(`[OK] Đã chuyển ${discountUsageCount} discount usages.`);

  // 15. SUPPORT REQUESTS & LOGS
  console.log('--- 15. Di chuyển Support Requests ---');
  const pgSupportRequests = await pgClient.query('SELECT * FROM support_requests ORDER BY id ASC');
  for (const sr of pgSupportRequests.rows) {
    const facilityId = facilityMap.get(sr.facility_id);
    const customerId = userMap.get(sr.customer_id);
    const assignedStaffId = sr.assigned_staff_id ? userMap.get(sr.assigned_staff_id) : null;
    const contractItemId = sr.contract_item_id ? contractItemMap.get(sr.contract_item_id) : null;
    if (facilityId && customerId) {
      const created = await prisma.supportRequest.create({
        data: {
          requestCode: sr.request_code,
          facilityId,
          customerId,
          contractItemId,
          assignedStaffId,
          category: sr.category,
          subject: sr.subject,
          description: sr.description,
          priority: sr.priority,
          status: sr.status,
          photos: sr.photos || [],
          resolvedAt: sr.resolved_at,
          createdAt: sr.created_at,
          updatedAt: sr.updated_at,
        },
      });
      supportRequestMap.set(sr.id, created.id);
    }
  }
  console.log(`[OK] Đã chuyển ${supportRequestMap.size} support requests.`);

  const pgSupportLogs = await pgClient.query('SELECT * FROM support_request_logs ORDER BY id ASC');
  let supportLogsCount = 0;
  for (const sl of pgSupportLogs.rows) {
    const srId = supportRequestMap.get(sl.support_request_id);
    const uId = userMap.get(sl.user_id);
    if (srId && uId) {
      await prisma.supportRequestLog.create({
        data: {
          supportRequestId: srId,
          userId: uId,
          note: sl.note,
          oldStatus: sl.old_status,
          newStatus: sl.new_status,
          createdAt: sl.created_at,
        },
      });
      supportLogsCount++;
    }
  }
  console.log(`[OK] Đã chuyển ${supportLogsCount} support request logs.`);

  console.log('\n======================================================');
  console.log('🎉 TOÀN BỘ DỮ LIỆU ĐÃ ĐƯỢC CHUYỂN THÀNH CÔNG SANG MONGODB ATLAS!');
  console.log('======================================================\n');
}

main()
  .catch((err) => {
    console.error('❌ Lỗi khi di chuyển dữ liệu:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pgClient.end();
    await prisma.$disconnect();
  });
