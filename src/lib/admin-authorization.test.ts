import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { event: { findFirst: mocks.findFirst } },
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));

import {
  AdminAuthorizationError,
  eventAccessWhere,
  eventScopeFor,
  requireEventAccess,
} from "@/lib/admin-authorization";
import type { AdminPrincipal } from "@/lib/auth";

const owner: AdminPrincipal = {
  id: "owner-id",
  email: "owner@example.test",
  displayName: "Owner",
  role: "OWNER",
};

const administrator: AdminPrincipal = {
  id: "admin-id",
  email: "admin@example.test",
  displayName: "Administrator",
  role: "ADMIN",
};

describe("administrator event authorization", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.requireAdmin.mockReset();
  });

  it("lets the owner query every event", () => {
    expect(eventScopeFor(owner)).toEqual({});
    expect(eventAccessWhere(owner, "event-id")).toEqual({ id: "event-id" });
  });

  it("limits an invited administrator to events they created", () => {
    expect(eventScopeFor(administrator)).toEqual({ createdById: "admin-id" });
    expect(eventAccessWhere(administrator, "event-id")).toEqual({
      id: "event-id",
      createdById: "admin-id",
    });
  });

  it("rejects an event outside the administrator's scope", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      requireEventAccess("another-event", administrator),
    ).rejects.toBeInstanceOf(AdminAuthorizationError);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "another-event", createdById: "admin-id" },
      select: { id: true },
    });
  });

  it("uses the authenticated principal when one is not supplied", async () => {
    mocks.requireAdmin.mockResolvedValue(administrator);
    mocks.findFirst.mockResolvedValue({ id: "event-id" });

    await expect(requireEventAccess("event-id")).resolves.toEqual(
      administrator,
    );
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
  });
});
