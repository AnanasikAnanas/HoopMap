import { create } from "zustand";

type Filters = { surface: string; condition: string; hasLighting: boolean };
type MapState = {
  selectedCourtId: number | null;
  filters: Filters;
  selectCourt: (id: number | null) => void;
  setFilters: (filters: Partial<Filters>) => void;
};

export const useMapStore = create<MapState>((set) => ({
  selectedCourtId: null,
  filters: { surface: "", condition: "", hasLighting: false },
  selectCourt: (selectedCourtId) => set({ selectedCourtId }),
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
}));
