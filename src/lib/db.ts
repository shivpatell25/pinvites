import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnvironment } from "@/lib/env";

const globalDatabase = globalThis as unknown as {
  pinvitesPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const environment = getServerEnvironment();
  const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: environment.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalDatabase.pinvitesPrisma ?? createPrismaClient();
export const prisma = db;

if (getServerEnvironment().NODE_ENV !== "production") {
  globalDatabase.pinvitesPrisma = db;
}
