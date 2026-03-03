/**
 * Generate unique ID
 * Format: timestamp-randomString
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};
