import { Pool } from "@neondatabase/serverless";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c timezone=Europe/Istanbul",
});

export default pool;
