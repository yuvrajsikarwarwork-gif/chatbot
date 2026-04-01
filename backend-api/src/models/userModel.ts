import { query } from "../config/db";

export async function findUserByEmail(email: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const res = await query(
    "SELECT id, email, name, phone_number, workspace_id, password_hash AS password, role FROM users WHERE LOWER(email) = $1",
    [normalizedEmail]
  );

  return res.rows[0];
}

export async function findUserById(id: string) {
  const res = await query(
    "SELECT id, email, name, phone_number, workspace_id, password_hash AS password, role FROM users WHERE id = $1",
    [id]
  );

  return res.rows[0];
}

export async function createUser(
  email: string,
  passwordHash: string,
  name: string,
  role: string = "user",
  phoneNumber?: string | null
) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const res = await query(
    `
    INSERT INTO users (id, email, password_hash, name, role, phone_number)
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
    RETURNING id, email, name, phone_number, role
    `,
    [normalizedEmail, passwordHash, name, role, phoneNumber || null]
  );

  return res.rows[0];
}

export async function listUsers() {
  const res = await query(
    `SELECT id, email, name, phone_number, workspace_id, role, created_at
     FROM users
     ORDER BY created_at ASC`
  );

  return res.rows;
}

export async function updateUserById(
  id: string,
  input: {
    name?: string;
    email?: string;
    role?: string;
    phoneNumber?: string | null;
    workspaceId?: string | null;
  }
) {
  const nextEmail = input.email === undefined ? null : String(input.email || "").trim().toLowerCase();
  const res = await query(
    `UPDATE users
     SET
       name = COALESCE($1, name),
       email = COALESCE($2, email),
       role = COALESCE($3, role),
       workspace_id = CASE WHEN $4::uuid IS NULL THEN workspace_id ELSE $4 END,
       phone_number = CASE WHEN $5::text IS NULL THEN phone_number ELSE $5 END
     WHERE id = $6
     RETURNING id, email, name, phone_number, workspace_id, role, created_at`,
    [
      input.name === undefined ? null : input.name,
      nextEmail,
      input.role === undefined ? null : input.role,
      input.workspaceId === undefined ? null : input.workspaceId,
      input.phoneNumber === undefined ? null : input.phoneNumber,
      id,
    ]
  );

  return res.rows[0];
}

export async function deleteUserById(id: string) {
  const res = await query(
    `DELETE FROM users
     WHERE id = $1
     RETURNING id, email, name, phone_number, workspace_id, role, created_at`,
    [id]
  );

  return res.rows[0];
}
