import { query } from "../config/db";

export async function findUserByEmail(email: string) {
  const res = await query(
    "SELECT id, email, name, workspace_id, password_hash AS password, role FROM users WHERE email = $1",
    [email]
  );

  return res.rows[0];
}

export async function findUserById(id: string) {
  const res = await query(
    "SELECT id, email, name, workspace_id, password_hash AS password, role FROM users WHERE id = $1",
    [id]
  );

  return res.rows[0];
}

export async function createUser(
  email: string,
  passwordHash: string,
  name: string,
  role: string = "user"
) {
  const res = await query(
    `
    INSERT INTO users (id, email, password_hash, name, role)
    VALUES (gen_random_uuid(), $1, $2, $3, $4)
    RETURNING id, email, name, role
    `,
    [email, passwordHash, name, role]
  );

  return res.rows[0];
}

export async function listUsers() {
  const res = await query(
    `SELECT id, email, name, workspace_id, role, created_at
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
    workspaceId?: string | null;
  }
) {
  const res = await query(
    `UPDATE users
     SET
       name = COALESCE($1, name),
       email = COALESCE($2, email),
       role = COALESCE($3, role),
       workspace_id = CASE WHEN $4::uuid IS NULL THEN workspace_id ELSE $4 END
     WHERE id = $5
     RETURNING id, email, name, workspace_id, role, created_at`,
    [
      input.name === undefined ? null : input.name,
      input.email === undefined ? null : input.email,
      input.role === undefined ? null : input.role,
      input.workspaceId === undefined ? null : input.workspaceId,
      id,
    ]
  );

  return res.rows[0];
}
