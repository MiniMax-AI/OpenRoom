export const cleanNil = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const result: Partial<T> = {};
  const blackList: unknown[] = ['', null, undefined];
  for (const p in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, p) && !blackList.includes(obj[p])) {
      result[p] = obj[p];
    }
  }
  return result;
};
