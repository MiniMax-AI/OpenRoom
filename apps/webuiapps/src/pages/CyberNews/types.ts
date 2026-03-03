export type ArticleCategory = 'breaking' | 'corporate' | 'street' | 'tech';

export interface Article {
  id: string;
  title: string;
  category: ArticleCategory;
  summary: string;
  content: string;
  imageUrl: string;
  publishedAt: string;
}

export interface Clue {
  id: string;
  type: 'press' | 'report' | 'document' | 'message' | 'note';
  title: string;
  content: string;
  posX: number;
  posY: number;
  connections?: string[];
}

export interface Case {
  id: string;
  caseNumber: string;
  title: string;
  status: 'open' | 'closed' | 'classified';
  clues: Clue[];
}

export interface AppState {
  currentView: 'news' | 'case-board';
  selectedArticleId: string | null;
  selectedCaseId: string | null;
  newsFilter: ArticleCategory | null;
}
