import fs from 'node:fs'

const sql = ['001_schema.sql', '003_functions.sql']
  .map((file) => fs.readFileSync(new URL(`../src/db/migrations/${file}`, import.meta.url), 'utf8'))
  .join('\n')

test('defines nullable legacy-compatible tour ownership with a durable restricted foreign key', () => {
  expect(sql).toMatch(/created_by_user_id integer/i)
  expect(sql).toMatch(/FOREIGN KEY \(created_by_user_id\) REFERENCES public\.users\(id\) ON DELETE RESTRICT/i)
  expect(sql).toMatch(/NULL identifies backward-compatible legacy\/system inventory/i)
  expect(sql).toMatch(/createdByUserId/i)
})

test('role changes protect administrators, revoke sessions, and require an audit', () => {
  expect(sql).toMatch(/SELF_ADMIN_DEMOTION_FORBIDDEN/)
  expect(sql).toMatch(/LAST_ACTIVE_ADMIN_REQUIRED/)
  expect(sql).toMatch(/LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE/i)
  expect(sql).toMatch(/UPDATE refresh_tokens SET revoked_at = NOW\(\)/i)
  expect(sql).toMatch(/ADMIN_AUDIT_REQUIRED/)
})

test('does not retain the obsolete owner-eligibility helper', () => {
  expect(sql).not.toMatch(/CREATE FUNCTION public\.tour_owner_is_publicly_eligible/)
})
