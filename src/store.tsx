import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Account, Boot, Category } from './api';

export interface Store {
  boot: Boot;
  reload: () => Promise<void>;
  toast: (msg: string) => void;
  startTour: () => void;
  account: (id: number | null | undefined) => Account | undefined;
  category: (id: number | null | undefined) => Category | undefined;
}

export const StoreCtx = createContext<Store>(null!);
export const useStore = () => useContext(StoreCtx);
