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
  INTERNAL_ENGINE_SECRET: readEnv("INTERNAL_ENGINE_SECRET"),
  JWT_SECRET: readEnv("JWT_SECRET", "secret"),
  PUBLIC_API_BASE_URL: readEnv("PUBLIC_API_BASE_URL"),
  PUBLIC_APP_BASE_URL: readEnv("PUBLIC_APP_BASE_URL", "http://localhost:3000"),
  INTEGRATION_SECRET_KEY: readEnv("INTEGRATION_SECRET_KEY"),
  META_APP_ID: readEnv("META_APP_ID"),
  META_APP_SECRET: readEnv("META_APP_SECRET"),
  META_EMBEDDED_SIGNUP_CONFIG_ID: readEnv("META_EMBEDDED_SIGNUP_CONFIG_ID"),
  META_WEBHOOK_VERIFY_TOKEN: readEnv("META_WEBHOOK_VERIFY_TOKEN"),
  SMTP_HOST: readEnv("SMTP_HOST"),
  SMTP_PORT: readEnv("SMTP_PORT"),
  SMTP_USER: readEnv("SMTP_USER"),
  SMTP_PASS: readEnv("SMTP_PASS"),
  SMTP_FROM: readEnv("SMTP_FROM"),
  EMAIL_PROVIDER: readEnv("EMAIL_PROVIDER", "smtp"),
  SENDGRID_API_KEY: readEnv("SENDGRID_API_KEY"),
  SENDGRID_FROM: readEnv("SENDGRID_FROM"),
  POSTMARK_SERVER_TOKEN: readEnv("POSTMARK_SERVER_TOKEN"),
  POSTMARK_FROM: readEnv("POSTMARK_FROM"),
  NODE_ENV: readEnv("NODE_ENV", "development"),
  INTEGRATION_SECRET_KEY_PREVIOUS: readEnv("INTEGRATION_SECRET_KEY_PREVIOUS"),
  INTEGRATION_SECRET_KEY_VERSION: readEnv("INTEGRATION_SECRET_KEY_VERSION", "v1"),
};
