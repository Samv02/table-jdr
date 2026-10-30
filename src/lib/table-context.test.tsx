import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableEnvironment } from "@/components/TableEnvironment";
import { TableContext, useTable, type TableState } from "./table-context";

vi.mock("@/lib/active-character", () => ({ useIdentity: () => ({ userId: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(cleanup);

function Consumer() {
  const table = useTable();
  return <output data-testid="scene-count">{table.scenes.length}</output>;
}

describe("shared table context", () => {
  it("connects the environment provider to consumers from the stable module", () => {
    render(
      <TableEnvironment>
        <Consumer />
      </TableEnvironment>,
    );
    expect(screen.getByTestId("scene-count").textContent).toBe("0");
  });

  it("reads updated provider values without replacing context identity", () => {
    const initial: TableState = {
      scenes: [],
      activeScene: null,
      music: {},
      party: [],
      online: new Set(),
      clean: false,
      toggleClean: vi.fn(),
      refresh: async () => {},
      serverNow: () => 0,
    };
    const view = render(
      <TableContext.Provider value={initial}>
        <Consumer />
      </TableContext.Provider>,
    );
    view.rerender(
      <TableContext.Provider
        value={{
          ...initial,
          scenes: [
            {
              id: "scene-1",
              name: "Watson",
              subtitle: "",
              image_path: "watson.jpg",
              sort_order: 0,
            },
          ],
        }}
      >
        <Consumer />
      </TableContext.Provider>,
    );
    expect(screen.getByTestId("scene-count").textContent).toBe("1");
  });
});
