/**
 * Path utility functions
 * Pure functions, no external dependencies
 */

/**
 * Extract file name from path
 */
export const getFileName = (path: string): string => {
  const parts = path.split('/');
  return parts[parts.length - 1] || '';
};

/**
 * Get parent path
 */
export const getParentPath = (path: string): string => {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
};

/**
 * Normalize path
 * - Merge redundant slashes
 * - Ensure leading /
 * - Remove trailing slash (except root)
 */
export const normalizePath = (path: string): string => {
  let normalized = path.replace(/\/+/g, '/');
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
};

/**
 * Extract directory path from full path (without leading slash)
 * Matches server-side TextFile.path semantics: the folder containing the file
 *
 * Examples:
 *   "/posts/tweet_123.json" -> "posts"
 *   "/a/b/c/file.txt"      -> "a/b/c"
 *   "/state.json"           -> "" (root directory)
 */
export const getDirPath = (fullPath: string): string => {
  const parent = getParentPath(fullPath);
  // Strip leading slash, root "/" becomes ""
  return parent === '/' ? '' : parent.replace(/^\//, '');
};
