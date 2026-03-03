export const APP_ID = 10008;
export const APP_NAME = 'cyberNews';

// File paths
export const ARTICLES_DIR = '/articles';
export const CASES_DIR = '/cases';
export const STATE_FILE = '/state.json';

export const ActionTypes = {
  // Operation Actions
  VIEW_ARTICLE: 'VIEW_ARTICLE',
  SELECT_CASE: 'SELECT_CASE',
  MOVE_CLUE: 'MOVE_CLUE',
  FILTER_NEWS: 'FILTER_NEWS',
  // Mutation Actions
  CREATE_ARTICLE: 'CREATE_ARTICLE',
  UPDATE_ARTICLE: 'UPDATE_ARTICLE',
  DELETE_ARTICLE: 'DELETE_ARTICLE',
  CREATE_CASE: 'CREATE_CASE',
  UPDATE_CASE: 'UPDATE_CASE',
  DELETE_CASE: 'DELETE_CASE',
  CREATE_CLUE: 'CREATE_CLUE',
  UPDATE_CLUE: 'UPDATE_CLUE',
  DELETE_CLUE: 'DELETE_CLUE',
  // Refresh Actions
  REFRESH_ARTICLES: 'REFRESH_ARTICLES',
  REFRESH_CASES: 'REFRESH_CASES',
  // System Actions
  SYNC_STATE: 'SYNC_STATE',
} as const;

export const DEFAULT_APP_STATE = {
  currentView: 'news' as const,
  selectedArticleId: null,
  selectedCaseId: null,
  newsFilter: null,
};
