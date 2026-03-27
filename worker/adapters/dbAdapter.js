"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = void 0;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL ||
        "postgresql://postgres:Yuvraj@0210@localhost:5432/chatbot_platform",
});
const query = (text, params) => {
    return pool.query(text, params);
};
exports.query = query;
exports.default = {
    query: exports.query,
};
