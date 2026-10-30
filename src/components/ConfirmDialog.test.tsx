import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfirmHost, confirmAction } from "./ConfirmDialog";

describe("confirmation dans l'appli", () => {
  it("Supprimer → true, et le dialogue se ferme", async () => {
    render(<ConfirmHost />);
    let p!: Promise<boolean>;
    act(() => {
      p = confirmAction({ title: "Supprimer « Sword » ?", message: "Irréversible." });
    });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Supprimer « Sword » ?")).toBeTruthy();
    // « Annuler » a le focus : Entrée ne supprime pas par accident
    expect(document.activeElement?.textContent).toBe("Annuler");
    fireEvent.click(screen.getByText("Supprimer"));
    await expect(p).resolves.toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Échap ou Annuler → false", async () => {
    render(<ConfirmHost />);
    let p!: Promise<boolean>;
    act(() => {
      p = confirmAction({ title: "Supprimer ?" });
    });
    fireEvent.keyDown(window, { key: "Escape" });
    await expect(p).resolves.toBe(false);
    act(() => {
      p = confirmAction({ title: "Supprimer ?" });
    });
    fireEvent.click(screen.getByText("Annuler"));
    await expect(p).resolves.toBe(false);
  });

  it("sans hôte monté, rien n'est supprimé", async () => {
    await expect(confirmAction({ title: "x" })).resolves.toBe(false);
  });
});
