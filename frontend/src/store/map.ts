import { create } from "zustand";

export type MapFilters = {
  surface: string;
  condition: string;
  hasLighting: boolean;
};
type MapState = {
  selectedCourtId: number | null;
  filters: MapFilters;
  selectCourt: (id: number | null) => void;
  setFilters: (filters: Partial<MapFilters>) => void;
};

export const useMapStore = create<MapState>((set) => ({
  selectedCourtId: null,
  filters: { surface: "", condition: "", hasLighting: false },
  selectCourt: (selectedCourtId) => set({ selectedCourtId }),
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
}));
