import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import { AdminRole } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { normalizeEmail } from "../src/lib/security/identity";
import {
  hashPassword,
  validateAdminPassword,
} from "../src/lib/security/password";

interface CommandOptions {
  update: boolean;
  role?: AdminRole;
}

function parseOptions(arguments_: readonly string[]): CommandOptions {
  let update = false;
  let role: AdminRole | undefined;

  for (const argument of arguments_) {
    if (argument === "--update") {
      update = true;
      continue;
    }
    if (argument.startsWith("--role=")) {
      const value = argument.slice("--role=".length).toUpperCase();
      if (value !== AdminRole.OWNER && value !== AdminRole.ADMIN) {
        throw new Error("--role must be OWNER or ADMIN");
      }
      role = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { update, ...(role ? { role } : {}) };
}

async function prompt(message: string): Promise<string> {
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    return (await reader.question(message)).trim();
  } finally {
    reader.close();
  }
}

async function promptForSecret(message: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error(
      "No interactive terminal is available. Set PINVITES_ADMIN_PASSWORD for this one-time command.",
    );
  }

  stdout.write(message);
  stdin.setEncoding("utf8");
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";

    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const onData = (chunk: string | Buffer) => {
      const text = chunk.toString();
      for (const character of text) {
        if (character === "\u0003") {
          finish(new Error("Administrator creation cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") {
          value += character;
        }
      }
    };

    stdin.on("data", onData);
  });
}

function validateEmail(email: string): void {
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid administrator email address.");
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const configuredEmail = process.env.PINVITES_ADMIN_EMAIL?.trim();
  const configuredName = process.env.PINVITES_ADMIN_NAME?.trim();
  const email = configuredEmail || (await prompt("Administrator email: "));
  const displayName =
    configuredName || (await prompt("Administrator display name: "));
  const password =
    process.env.PINVITES_ADMIN_PASSWORD ??
    (await promptForSecret("Administrator password: "));

  validateEmail(email);
  if (displayName.length < 1 || displayName.length > 120) {
    throw new Error(
      "Administrator display name must contain 1–120 characters.",
    );
  }

  const passwordStrength = validateAdminPassword(password);
  if (!passwordStrength.valid) {
    throw new Error(passwordStrength.errors.join(" "));
  }

  const normalizedEmail = normalizeEmail(email);
  const existingAdmin = await db.admin.findUnique({
    where: { normalizedEmail },
  });
  if (existingAdmin && !options.update) {
    throw new Error(
      "An administrator with this email already exists. Re-run with --update to explicitly rotate its password.",
    );
  }

  const adminCount = await db.admin.count();
  const role =
    options.role ??
    existingAdmin?.role ??
    (adminCount === 0 ? AdminRole.OWNER : AdminRole.ADMIN);
  const passwordHash = await hashPassword(password);
  const now = new Date();

  if (existingAdmin) {
    await db.$transaction(async (transaction) => {
      await transaction.admin.update({
        where: { id: existingAdmin.id },
        data: {
          email: email.trim(),
          displayName,
          passwordHash,
          passwordChangedAt: now,
          role,
          isActive: true,
        },
      });
      await transaction.adminSession.updateMany({
        where: { adminId: existingAdmin.id, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    stdout.write(
      `Updated administrator ${email.trim()} and revoked existing sessions.\n`,
    );
    return;
  }

  await db.admin.create({
    data: {
      email: email.trim(),
      normalizedEmail,
      displayName,
      passwordHash,
      passwordChangedAt: now,
      role,
    },
  });
  stdout.write(
    `Created ${role.toLowerCase()} administrator ${email.trim()}.\n`,
  );
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown administrator setup error";
    process.stderr.write(`Administrator setup failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
