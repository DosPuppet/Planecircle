/** Glossary window: open or closed, and the entry to show first (a word clicked in a text). */
import { create } from "zustand";

interface GlossaryState {
  open: boolean;
  /** Entry scrolled to and outlined when the window opens. */
  focus: string | null;
  openGlossary(focus?: string): void;
  closeGlossary(): void;
}

export const useGlossary = create<GlossaryState>((set) => ({
  open: false,
  focus: null,
  openGlossary: (focus) => set({ open: true, focus: focus ?? null }),
  closeGlossary: () => set({ open: false, focus: null }),
}));
