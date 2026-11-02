import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('manual Wadiah deposit reversal is atomic, restricted and audited', async t => {
  const db = new PGlite();
  const fixture = await readFile(new URL('./fixtures/correction-schema.sql', import.meta.url), 'utf8');
  const baseline = await readFile(new URL('./fixtures/production-payment-functions.sql', import.meta.url), 'utf8');
  const [schema, policies] = fixture.split('grant select on public.students');
  await db.exec(schema);
  await db.exec(baseline);
  await db.exec('grant select on public.students' + policies);

  const migration = await readFile(
    new URL('../supabase/migrations/20261102024139_reverse_manual_wadiah_deposit.sql', import.meta.url),
    'utf8',
  );
  await db.exec(migration);

  const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const admin = uid(1), staff = uid(2), cashier = uid(3), parent = uid(4);
  const student = uid(11), insufficientStudent = uid(12), unrelatedStudent = uid(13);
  await db.query('insert into auth.users(id) values ($1),($2),($3),($4)', [admin, staff, cashier, parent]);
  await db.query(
    "insert into user_roles(user_id,role) values ($1,'admin'),($2,'staff'),($3,'cashier'),($4,'parent')",
    [admin, staff, cashier, parent],
  );
  await db.query(
    `insert into students(id,parent_id,name,class,nik,is_active)
     values ($1,$2,'Student A','7A','1001',true),
            ($3,$2,'Student B','7A','1002',true),
            ($4,$2,'Student C','7A','1003',true)`,
    [student, parent, insufficientStudent, unrelatedStudent],
  );

  const sourceId = uid(101);
  await db.query(
    `insert into student_wadiah_balance(student_id,balance,total_deposited,total_used,total_sedekah)
     values ($1,316930,345000,28070,0),($2,100000,145000,45000,0),($3,145000,145000,0,0)`,
    [student, insufficientStudent, unrelatedStudent],
  );
  await db.query(
    `insert into wadiah_transactions(id,student_id,transaction_type,amount,balance_before,balance_after,notes,customer_consent)
     values ($1,$2,'deposit',145000,171930,316930,'Setoran wadiah manual',true)`,
    [sourceId, student],
  );

  const actor = async (id, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
    if (role) await db.exec(`set role ${role}`);
  };
  const row = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const asOwner = async fn => { await db.exec('reset role'); return fn(); };
  const reverse = (id = sourceId, reason = 'Salah input setoran manual') =>
    row('select public.reverse_manual_wadiah_deposit($1,$2) as reversal_id', [id, reason]);
  const mustFail = (fn, message) => assert.rejects(fn, message);

  await t.test('anonymous callers cannot execute the reversal endpoint', async () => {
    await actor(null, 'anon');
    await mustFail(() => reverse(), /permission denied/);
  });

  await t.test('staff and cashier cannot reverse manual deposits', async () => {
    await actor(staff);
    await mustFail(() => reverse(), /Hanya admin/);
    await actor(cashier);
    await mustFail(() => reverse(), /Hanya admin/);
  });

  await t.test('admin reverses exact manual deposit and retains both ledger entries', async () => {
    await actor(admin);
    const result = await reverse();
    assert.ok(result.reversal_id);

    await asOwner(async () => {
      const original = await row('select transaction_type,amount,balance_before,balance_after from wadiah_transactions where id=$1', [sourceId]);
      assert.deepEqual(original, {
        transaction_type: 'deposit',
        amount: 145000,
        balance_before: 171930,
        balance_after: 316930,
      });
      const reversal = await row('select transaction_type,amount,order_id,notes from wadiah_transactions where id=$1', [result.reversal_id]);
      assert.equal(reversal.transaction_type, 'adjustment');
      assert.equal(reversal.amount, -145000);
      assert.equal(reversal.order_id, null);
      assert.match(reversal.notes, /Salah input setoran manual/);

      const balance = await row('select balance,total_deposited,total_used from student_wadiah_balance where student_id=$1', [student]);
      assert.deepEqual(balance, { balance: 171930, total_deposited: 200000, total_used: 28070 });

      const link = await row('select original_transaction_id,reversal_transaction_id,amount,reason,created_by from wadiah_deposit_reversals where original_transaction_id=$1', [sourceId]);
      assert.deepEqual(link, {
        original_transaction_id: sourceId,
        reversal_transaction_id: result.reversal_id,
        amount: 145000,
        reason: 'Salah input setoran manual',
        created_by: admin,
      });
      const log = await row("select action,record_id,user_id,new_data->>'amount_reversed' as amount,new_data->>'total_deposited_before' as deposited_before,new_data->>'total_deposited_after' as deposited_after from audit_logs where action='REVERSE_MANUAL_DEPOSIT' and record_id=$1", [sourceId]);
      assert.deepEqual(log, { action: 'REVERSE_MANUAL_DEPOSIT', record_id: sourceId, user_id: admin, amount: '145000', deposited_before: '345000', deposited_after: '200000' });
    });
  });

  await t.test('duplicate reversal is rejected without changing the balance again', async () => {
    await actor(admin);
    await mustFail(() => reverse(), /sudah dibatalkan/);
    await asOwner(async () => {
      const balance = await row('select balance,total_deposited from student_wadiah_balance where student_id=$1', [student]);
      assert.equal(balance.balance, 171930);
      assert.equal(balance.total_deposited, 200000);
      const count = await row('select count(*)::int as count from wadiah_transactions where student_id=$1', [student]);
      assert.equal(count.count, 2);
    });
  });

  await t.test('non-manual deposits and order-linked transactions are not reversible', async () => {
    await asOwner(async () => {
      const migrationDeposit = uid(102);
      const orderLinked = uid(103);
      const orderId = uid(104);
      await db.query('insert into laundry_orders(id,student_id) values ($1,$2)', [orderId, unrelatedStudent]);
      await db.query(
        `insert into wadiah_transactions(id,student_id,transaction_type,amount,balance_before,balance_after,order_id,notes)
         values ($1,$2,'deposit',145000,0,145000,null,'Saldo awal migrasi data (17/1/2026)'),
                ($3,$4,'deposit',145000,0,145000,$5,'Setoran wadiah manual')`,
        [migrationDeposit, unrelatedStudent, orderLinked, unrelatedStudent, orderId],
      );
      await actor(admin);
      await mustFail(() => reverse(migrationDeposit), /Hanya transaksi Setoran wadiah manual/);
      await mustFail(() => reverse(orderLinked), /Hanya transaksi Setoran wadiah manual/);
    });
  });

  await t.test('insufficient balance and invalid reasons do not create partial records', async () => {
    await actor(admin);
    const insufficientId = uid(105);
    await asOwner(() => db.query(
      `insert into wadiah_transactions(id,student_id,transaction_type,amount,balance_before,balance_after,notes)
       values ($1,$2,'deposit',145000,0,145000,'Setoran wadiah manual')`,
      [insufficientId, insufficientStudent],
    ));
    await actor(admin);
    await mustFail(() => reverse(insufficientId), /tidak cukup/);
    await mustFail(() => reverse(uid(999), 'singkat'), /Alasan pembatalan wajib/);
    await asOwner(async () => {
      const balance = await row('select balance from student_wadiah_balance where student_id=$1', [insufficientStudent]);
      assert.equal(balance.balance, 100000);
      const link = await row('select count(*)::int as count from wadiah_deposit_reversals where original_transaction_id=$1', [insufficientId]);
      assert.equal(link.count, 0);
    });
  });

  await t.test('reversal status is private to admins and there are no direct write grants', async () => {
    await actor(staff);
    const staffRows = await row('select count(*)::int as count from wadiah_deposit_reversals');
    assert.equal(staffRows.count, 0);
    await actor(admin);
    const adminRows = await row('select count(*)::int as count from wadiah_deposit_reversals');
    assert.equal(adminRows.count, 1);
    await asOwner(async () => {
      const grants = await row(`select
        has_table_privilege('authenticated','public.wadiah_deposit_reversals','INSERT') as can_insert,
        has_table_privilege('authenticated','public.wadiah_deposit_reversals','UPDATE') as can_update,
        has_table_privilege('authenticated','public.wadiah_deposit_reversals','DELETE') as can_delete`);
      assert.deepEqual(grants, { can_insert: false, can_update: false, can_delete: false });
    });
  });

  await db.close();
});
