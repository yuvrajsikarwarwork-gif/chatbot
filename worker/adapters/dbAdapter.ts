import { Pool } from "pg";
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:Yuvraj@0210@localhost:5432/chatbot_platform",
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export default {
  query,
};