import { createDb } from "../../src/db/client";

/** Test DB URL; defaults to the docker-compose.test.yml database. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54329/polar_plate_test";

/** Opens a connection pool to the test database. Caller must `close()` it. */
export function createTestDb() {
  return createDb(TEST_DATABASE_URL);
}
