import React, { createContext, useContext, useSyncExternalStore } from 'react';
import type { DreamlandController, DreamlandSnapshot } from './controller';

const ControllerContext = createContext<DreamlandController | null>(null);

export const DreamlandProvider: React.FC<{
  controller: DreamlandController;
  children: React.ReactNode;
}> = ({ controller, children }) => (
  <ControllerContext.Provider value={controller}>{children}</ControllerContext.Provider>
);

export function useController(): DreamlandController {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('useController must be used inside DreamlandProvider');
  return controller;
}

/** Subscribe to the Dreamland state. */
export function useDreamland(): DreamlandSnapshot {
  const controller = useController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
