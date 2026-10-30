import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { admin: { getUserById: mocks.getUserById, deleteUser: mocks.deleteUser } },
    storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) },
  },
}));
vi.mock("./admin-log.server", () => ({ logAdmin: vi.fn() }));
import { deleteAccount } from "./accounts.functions";

const execute = deleteAccount as unknown as (args: {
  data: { userId: string };
  context: { userId: string; supabase: { rpc: typeof mocks.rpc } };
}) => Promise<{ deletedUserId: string }>;
const request = (target = "target") => ({
  data: { userId: target },
  context: { userId: "gm", supabase: { rpc: mocks.rpc } },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.getUserById.mockResolvedValue({ data: { user: { id: "target" } }, error: null });
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
});
describe("account deletion", () => {
  it("rejects non-admins before any privileged operation", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(execute(request())).rejects.toThrow("Suppression réservée à l’admin.");
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("rejects admin self deletion", async () => {
    await expect(execute(request("gm"))).rejects.toThrow(
      "Tu ne peux pas supprimer ton propre compte.",
    );
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("deletes only the requested account after its avatar cleanup", async () => {
    mocks.list.mockResolvedValueOnce({ data: [{ name: "photo.png" }], error: null });
    mocks.remove.mockResolvedValue({ error: null });
    await expect(execute(request())).resolves.toEqual({ deletedUserId: "target" });
    expect(mocks.remove).toHaveBeenCalledWith(["target/photo.png"]);
    expect(mocks.deleteUser).toHaveBeenCalledWith("target");
  });
  it("does not delete the account when avatar cleanup fails", async () => {
    mocks.list.mockResolvedValue({ data: null, error: new Error("unavailable") });
    await expect(execute(request())).rejects.toThrow(
      "Impossible de supprimer les avatars du compte.",
    );
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
