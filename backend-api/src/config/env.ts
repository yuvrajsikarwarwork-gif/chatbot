import dotenv from "dotenv";

dotenv.config();

function readEnv(name: string, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : fallback;
}

export const env = {
  PORT: readEnv("PORT", "4000"),
  DB_URL: readEnv("DB_URL"),
  REDIS_URL: readEnv("REDIS_URL"),
  JWT_SECRET: readEnv("JWT_SECRET", "secret"),
  PUBLIC_API_BASE_URL: readEnv("PUBLIC_API_BASE_URL"),
  PUBLIC_APP_BASE_URL: readEnv("PUBLIC_APP_BASE_URL", "http://localhost:3000"),
  INTEGRATION_SECRET_KEY: readEnv("INTEGRATION_SECRET_KEY"),
  META_APP_ID: readEnv("META_APP_ID"),
  META_APP_SECRET: readEnv("META_APP_SECRET"),
  SMTP_HOST: readEnv("SMTP_HOST"),
  SMTP_PORT: readEnv("SMTP_PORT"),
  SMTP_USER: readEnv("SMTP_USER"),
  SMTP_PASS: readEnv("SMTP_PASS"),
  SMTP_FROM: readEnv("SMTP_FROM"),
  NODE_ENV: readEnv("NODE_ENV", "development"),
};
