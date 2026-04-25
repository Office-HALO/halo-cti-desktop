import { create } from 'zustand';
import { localDateStr } from '../lib/utils.js';

export const useAppStore = create((set) => ({
  currentStaff: null,
  setCurrentStaff: (s) => set({ currentStaff: s }),

  allRequests: [],
  setAllRequests: (rows) => set({ allRequests: rows }),

  currentTab: 'pending',
  setCurrentTab: (tab) => set({ currentTab: tab }),

  todayDate: localDateStr(),
  setTodayDate: (d) => set({ todayDate: d }),

  todayShifts: [],
  setTodayShifts: (rows) => set({ todayShifts: rows }),

  todayReservations: [],
  setTodayReservations: (rows) => set({ todayReservations: rows }),

  reservationsDate: localDateStr(),
  setReservationsDate: (d) => set({ reservationsDate: d }),

  callsDate: localDateStr(),
  setCallsDate: (d) => set({ callsDate: d }),

  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  calShifts: [],
  setCalShifts: (rows) => set({ calShifts: rows }),
  setCalYearMonth: (y, m) => set({ calYear: y, calMonth: m }),

  allLadies: [],
  setAllLadies: (rows) => set({ allLadies: rows }),

  allCustomers: [],
  setAllCustomers: (rows) => set({ allCustomers: rows }),

  callPopupPos: null,
  setCallPopupPos: (pos) => set({ callPopupPos: pos }),

  calViewMode: 'full',
  calHalfOffset: 0,

  currentStoreId: localStorage.getItem('halo.cti.currentStoreId') || null,
  setCurrentStoreId: (id) => {
    if (id) localStorage.setItem('halo.cti.currentStoreId', id);
    else localStorage.removeItem('halo.cti.currentStoreId');
    set({ currentStoreId: id });
  },

  stores: [],
  setStores: (rows) => set({ stores: rows }),
}));
