import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useFileSystem,
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  generateId,
  createAppFileApi,
  fetchVibeInfo,
  useVibeInfo,
  type CharacterAppAction,
} from '@/lib';
import i18n from './i18n';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 2;
const APP_NAME = 'twitter';
const POSTS_DIR = '/posts';
const STATE_FILE = '/state.json';

// Create file API with App path prefix (module-level singleton, stable reference)
const twitterFileApi = createAppFileApi(APP_NAME);

const getPostFilePath = (postId: string): string => `${POSTS_DIR}/${postId}.json`;

// ============ Type Definitions (Business) ============
export type TwitterAction =
  | { type: 'CREATE_POST'; payload: { content: string } }
  | { type: 'UPDATE_POST'; payload: { filePath: string; postData: string } }
  | { type: 'LIKE_POST'; payload: { postId: string } }
  | { type: 'UNLIKE_POST'; payload: { postId: string } }
  | { type: 'DELETE_POST'; payload: { postId: string } }
  | { type: 'COMMENT_POST'; payload: { postId: string; content: string } };

interface Comment {
  id: string;
  author: {
    name: string;
    username: string;
    avatar: string;
  };
  content: string;
  timestamp: number;
}

interface Post {
  id: string;
  author: {
    name: string;
    username: string;
    avatar: string;
  };
  content: string;
  timestamp: number;
  likes: number;
  isLiked: boolean;
  comments: Comment[];
}

interface AppState {
  draftContent: string;
  currentUser: {
    name: string;
    username: string;
    avatar: string;
  };
}

// ============ Default State ============
const FALLBACK_USER = {
  name: 'Current User',
  username: '@current_user',
  avatar: '',
};

const DEFAULT_STATE: AppState = {
  draftContent: '',
  currentUser: FALLBACK_USER,
};

// ============ Utility Functions ============
const formatTime = (
  timestamp: number | string | undefined | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string => {
  const ts = typeof timestamp === 'string' ? Number(timestamp) : Number(timestamp);
  if (!ts || !isFinite(ts)) {
    return '';
  }

  const now = Date.now();
  const diff = now - ts;

  if (diff < 0 || diff < 60000) {
    return t('time.justNow');
  } else if (diff < 3600000) {
    return t('time.minutesAgo', { count: Math.floor(diff / 60000) });
  } else if (diff < 86400000) {
    return t('time.hoursAgo', { count: Math.floor(diff / 3600000) });
  } else {
    return t('time.daysAgo', { count: Math.floor(diff / 86400000) });
  }
};

const getInitial = (name: string) => name.charAt(0).toUpperCase();

// ============ Avatar Component ============
interface AvatarProps {
  name: string;
  avatarUrl?: string;
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ name, avatarUrl, className }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${className || styles.avatar} ${styles.avatarImg}`}
      />
    );
  }
  return <div className={className || styles.avatar}>{getInitial(name)}</div>;
};

// ============ SVG Icon Components ============
const Icons = {
  comment: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path>
    </svg>
  ),
  retweet: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"></path>
    </svg>
  ),
  like: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>
    </svg>
  ),
  likeFilled: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"></path>
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"></path>
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M2.504 21.866l.526-2.108C3.04 19.719 4 15.823 4 12s-.96-7.719-.97-7.757l-.527-2.109L22.236 12 2.504 21.866zM5.981 13c.089 1.936.303 3.876.479 5.301L17.764 12 6.46 5.699c-.176 1.425-.39 3.365-.479 5.301h5.227v2H5.981z"></path>
    </svg>
  ),
};

// ============ Sub-component: Comment Item ============
interface CommentItemProps {
  comment: Comment;
}

const CommentItem: React.FC<CommentItemProps> = ({ comment }) => {
  const { t } = useTranslation('twitter');
  return (
    <div className={styles.commentItem}>
      <Avatar
        name={comment.author.name}
        avatarUrl={comment.author.avatar}
        className={styles.commentAvatar}
      />
      <div className={styles.commentBody}>
        <div className={styles.commentHeader}>
          <span className={styles.commentAuthorName}>{comment.author.name}</span>
          <span className={styles.commentAuthorUsername}>{comment.author.username}</span>
          <span className={styles.commentTime}>· {formatTime(comment.timestamp, t)}</span>
        </div>
        <div className={styles.commentContent}>{comment.content}</div>
      </div>
    </div>
  );
};

// ============ Sub-component: Comment Section ============
interface CommentSectionProps {
  comments: Comment[];
  onSubmitComment: (content: string) => void;
  currentUserName: string;
  currentUserAvatar: string;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  comments,
  onSubmitComment,
  currentUserName,
  currentUserAvatar,
}) => {
  const [commentText, setCommentText] = useState('');
  const { t } = useTranslation('twitter');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (commentText.trim()) {
      onSubmitComment(commentText.trim());
      setCommentText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (commentText.trim()) {
        onSubmitComment(commentText.trim());
        setCommentText('');
      }
    }
  };

  return (
    <div className={styles.commentSection}>
      {comments.length > 0 && (
        <div className={styles.commentList}>
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}

      <form className={styles.commentForm} onSubmit={handleSubmit}>
        <Avatar
          name={currentUserName}
          avatarUrl={currentUserAvatar}
          className={styles.commentInputAvatar}
        />
        <input
          className={styles.commentInput}
          type="text"
          placeholder={t('commentPlaceholder')}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={280}
        />
        <button type="submit" className={styles.commentSendBtn} disabled={!commentText.trim()}>
          {Icons.send}
        </button>
      </form>
    </div>
  );
};

// ============ Sub-component: Post Card ============
interface PostCardProps {
  post: Post;
  onLike: (postId: string) => void;
  onUnlike: (postId: string) => void;
  onDelete: (postId: string) => void;
  onComment: (postId: string, content: string) => void;
  isCurrentUser: boolean;
  currentUserName: string;
  currentUserAvatar: string;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  onLike,
  onUnlike,
  onDelete,
  onComment,
  isCurrentUser,
  currentUserName,
  currentUserAvatar,
}) => {
  const { t } = useTranslation('twitter');
  const [showComments, setShowComments] = useState(false);

  const handleLikeClick = () => {
    if (post.isLiked) {
      onUnlike(post.id);
    } else {
      onLike(post.id);
    }
  };

  const handleCommentClick = () => {
    setShowComments((prev) => !prev);
  };

  const handleSubmitComment = (content: string) => {
    onComment(post.id, content);
  };

  const commentCount = post.comments?.length || 0;

  return (
    <div className={styles.postCard}>
      <Avatar name={post.author?.name || '?'} avatarUrl={post.author?.avatar} />
      <div className={styles.postBody}>
        <div className={styles.postHeader}>
          <div className={styles.authorInfo}>
            <span className={styles.authorName}>{post.author?.name || t('unknownUser')}</span>
            <span className={styles.authorUsername}>{post.author?.username || ''}</span>
            <span className={styles.postTime}>· {formatTime(post.timestamp, t)}</span>
          </div>
          {isCurrentUser && (
            <button
              className={styles.deleteBtn}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(post.id);
              }}
              title={t('deletePost')}
            >
              {Icons.close}
            </button>
          )}
        </div>
        <div className={styles.postContent}>{post.content}</div>
        <div className={styles.postActions}>
          <button
            className={`${styles.actionBtn} ${styles.commentBtn} ${showComments ? styles.active : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleCommentClick();
            }}
          >
            <span className={styles.icon}>{Icons.comment}</span>
            <span className={styles.count}>{commentCount || ''}</span>
          </button>
          <button className={styles.actionBtn} onClick={(e) => e.stopPropagation()}>
            <span className={styles.icon}>{Icons.retweet}</span>
            <span className={styles.count}>0</span>
          </button>
          <button
            className={`${styles.actionBtn} ${styles.likeBtn} ${post.isLiked ? styles.liked : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleLikeClick();
            }}
          >
            <span className={styles.icon}>{post.isLiked ? Icons.likeFilled : Icons.like}</span>
            <span className={styles.count}>{post.likes || ''}</span>
          </button>
          <button className={styles.actionBtn} onClick={(e) => e.stopPropagation()}>
            <span className={styles.icon}>{Icons.share}</span>
          </button>
        </div>

        {showComments && (
          <CommentSection
            comments={post.comments || []}
            onSubmitComment={handleSubmitComment}
            currentUserName={currentUserName}
            currentUserAvatar={currentUserAvatar}
          />
        )}
      </div>
    </div>
  );
};

// ============ Sub-component: Create Post Form ============
interface CreatePostFormProps {
  onSubmit: (content: string) => void;
  draftContent: string;
  onDraftChange: (content: string) => void;
  currentUserName: string;
  currentUserAvatar: string;
}

const CreatePostForm: React.FC<CreatePostFormProps> = ({
  onSubmit,
  draftContent,
  onDraftChange,
  currentUserName,
  currentUserAvatar,
}) => {
  const { t } = useTranslation('twitter');
  const maxLength = 280;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftContent.trim()) {
      onSubmit(draftContent.trim());
    }
  };

  return (
    <form className={styles.createPostForm} onSubmit={handleSubmit}>
      <div className={styles.formHeader}>
        <Avatar name={currentUserName} avatarUrl={currentUserAvatar} />
        <textarea
          className={styles.textarea}
          placeholder={t('placeholder')}
          value={draftContent}
          onChange={(e) => onDraftChange(e.target.value)}
          maxLength={maxLength}
          rows={2}
        />
      </div>
      <div className={styles.formFooter}>
        <span className={styles.charCount}>
          {draftContent.length > 0 ? `${draftContent.length}/${maxLength}` : ''}
        </span>
        <button type="submit" className={styles.submitBtn} disabled={!draftContent.trim()}>
          {t('post')}
        </button>
      </div>
    </form>
  );
};

// ============ Main Component: Twitter Page ============
const Twitter: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [draftContent, setDraftContent] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation('twitter');

  // File system Hook (destructure stable function references to avoid infinite loops from using the whole object as dependency)
  const {
    saveFile: fsSaveFile,
    syncToCloud,
    deleteFromCloud,
    initFromCloud,
    getChildrenByPath,
    getByPath,
    updateNode,
    removeByPath,
  } = useFileSystem({ fileApi: twitterFileApi });

  // Vibe environment info (user / character / system settings)
  const { userInfo } = useVibeInfo();

  // Current user info (auto-updates after vibeInfo is fetched)
  const currentUserRef = useRef(FALLBACK_USER);
  useEffect(() => {
    if (userInfo) {
      currentUserRef.current = {
        name: userInfo.nickname || FALLBACK_USER.name,
        username: `@${userInfo.nickname || 'user'}`,
        avatar: userInfo.avatarUrl || '',
      };
    }
  }, [userInfo]);

  // ============ File System Helpers ============

  const loadPostsFromFS = useCallback((): Post[] => {
    const children = getChildrenByPath(POSTS_DIR);
    return children
      .filter((node) => node.type === 'file' && node.content !== null && node.content !== undefined)
      .map((node) => {
        // node.content may be a parsed object or an unparsed JSON string
        let post: Post;
        if (typeof node.content === 'string') {
          try {
            post = JSON.parse(node.content) as Post;
          } catch {
            console.warn('[Twitter] Failed to parse post content:', node.path);
            return null;
          }
        } else {
          post = node.content as Post;
        }
        return {
          ...post,
          author: post.author || { name: 'Unknown', username: '@unknown', avatar: '' },
          comments: post.comments || [],
        };
      })
      .filter((post): post is Post => post !== null && post !== undefined && !!post.id)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [getChildrenByPath]);

  const loadState = useCallback((): AppState | null => {
    const node = getByPath(STATE_FILE);
    return (node?.content as AppState) || null;
  }, [getByPath]);

  const saveState = useCallback(
    async (state: AppState) => {
      fsSaveFile(STATE_FILE, state);
      try {
        await syncToCloud(STATE_FILE, state);
      } catch (error) {
        console.error('[Twitter] Failed to sync state to cloud:', error);
      }
    },
    [fsSaveFile, syncToCloud],
  );

  // ============ Business Logic: User Operations ============

  const handleCreatePost = useCallback(
    async (content: string) => {
      const id = generateId();
      const post: Post = {
        id,
        author: currentUserRef.current,
        content,
        timestamp: Date.now(),
        likes: 0,
        isLiked: false,
        comments: [],
      };

      const filePath = getPostFilePath(id);

      setPosts((prev) => [post, ...prev]);
      setDraftContent('');

      fsSaveFile(filePath, post);

      try {
        await syncToCloud(filePath, post);
      } catch (error) {
        console.error('[Twitter] Failed to sync post to cloud:', error);
      }

      saveState({ ...DEFAULT_STATE, currentUser: currentUserRef.current, draftContent: '' });
      reportAction(APP_ID, 'CREATE_POST', { content });
    },
    [fsSaveFile, syncToCloud, saveState],
  );

  const handleLikePost = useCallback(
    async (postId: string) => {
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId ? { ...post, isLiked: true, likes: post.likes + 1 } : post,
        ),
      );

      const filePath = getPostFilePath(postId);
      const node = getByPath(filePath);
      if (node) {
        const post = node.content as Post;
        const updatedPost = { ...post, isLiked: true, likes: post.likes + 1 };
        updateNode(node.id, { content: updatedPost });
        try {
          await syncToCloud(filePath, updatedPost);
        } catch (error) {
          console.error('[Twitter] Failed to sync like to cloud:', error);
        }
      }

      reportAction(APP_ID, 'LIKE_POST', { postId });
    },
    [getByPath, updateNode, syncToCloud],
  );

  const handleUnlikePost = useCallback(
    async (postId: string) => {
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? { ...post, isLiked: false, likes: Math.max(0, post.likes - 1) }
            : post,
        ),
      );

      const filePath = getPostFilePath(postId);
      const node = getByPath(filePath);
      if (node) {
        const post = node.content as Post;
        const updatedPost = { ...post, isLiked: false, likes: Math.max(0, post.likes - 1) };
        updateNode(node.id, { content: updatedPost });
        try {
          await syncToCloud(filePath, updatedPost);
        } catch (error) {
          console.error('[Twitter] Failed to sync unlike to cloud:', error);
        }
      }

      reportAction(APP_ID, 'UNLIKE_POST', { postId });
    },
    [getByPath, updateNode, syncToCloud],
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      const filePath = getPostFilePath(postId);

      setPosts((prev) => prev.filter((post) => post.id !== postId));
      removeByPath(filePath);

      try {
        await deleteFromCloud(filePath);
      } catch (error) {
        console.error('[Twitter] Failed to delete post from cloud:', error);
      }

      reportAction(APP_ID, 'DELETE_POST', { postId });
    },
    [removeByPath, deleteFromCloud],
  );

  const handleCommentPost = useCallback(
    async (postId: string, content: string) => {
      const comment: Comment = {
        id: generateId(),
        author: currentUserRef.current,
        content,
        timestamp: Date.now(),
      };

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId ? { ...post, comments: [...(post.comments || []), comment] } : post,
        ),
      );

      const filePath = getPostFilePath(postId);
      const node = getByPath(filePath);
      if (node) {
        const post = node.content as Post;
        const updatedPost = { ...post, comments: [...(post.comments || []), comment] };
        updateNode(node.id, { content: updatedPost });
        try {
          await syncToCloud(filePath, updatedPost);
        } catch (error) {
          console.error('[Twitter] Failed to sync comment to cloud:', error);
        }
      }

      reportAction(APP_ID, 'COMMENT_POST', { postId, content });
    },
    [getByPath, updateNode, syncToCloud],
  );

  const handleDraftChange = useCallback((content: string) => {
    setDraftContent(content);
  }, []);

  // Debounced draft save
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!isInitialized) return;

    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = setTimeout(() => {
      saveState({
        draftContent,
        currentUser: currentUserRef.current,
      });
    }, 1000);

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [draftContent, isInitialized, saveState]);

  // ============ Cloud Single-file Sync Helper ============
  /**
   * Read a single post file from cloud and update local file tree and UI
   * Agent has already written/modified on cloud, frontend only needs to sync latest data
   */
  const syncPostFromCloud = useCallback(
    async (filePath: string): Promise<Post | null> => {
      try {
        const result = await twitterFileApi.readFile(filePath);
        if (!result.content) {
          console.warn('[Twitter] syncPostFromCloud: empty content for', filePath);
          return null;
        }

        const post: Post =
          typeof result.content === 'string'
            ? JSON.parse(result.content)
            : (result.content as Post);

        // Ensure fields are complete
        const normalizedPost: Post = {
          ...post,
          author: post.author || { name: 'Unknown', username: '@unknown', avatar: '' },
          comments: post.comments || [],
        };

        // Update local file tree
        fsSaveFile(filePath, normalizedPost);

        return normalizedPost;
      } catch (error) {
        console.error('[Twitter] syncPostFromCloud failed:', filePath, error);
        return null;
      }
    },
    [fsSaveFile],
  );

  // ============ Agent Action Listener (using shared Hook) ============
  // Agent has already completed cloud file write/modify/delete before calling action,
  // frontend only needs to sync latest data from cloud and refresh UI after receiving action.
  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        case 'CREATE_POST': {
          const filePath = action.params?.filePath;
          if (!filePath) return 'error: missing filePath';

          const post = await syncPostFromCloud(filePath);
          if (!post) return 'error: failed to sync post from cloud';

          setPosts((prev) => [post, ...prev]);
          return 'success';
        }

        case 'UPDATE_POST': {
          const filePath = action.params?.filePath;
          if (!filePath) return 'error: missing filePath';

          const post = await syncPostFromCloud(filePath);
          if (!post) return 'error: failed to sync post from cloud';

          setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
          return 'success';
        }

        case 'DELETE_POST': {
          const postId = action.params?.postId;
          if (!postId) return 'error: missing postId';

          const filePath = getPostFilePath(postId);
          removeByPath(filePath);
          setPosts((prev) => prev.filter((p) => p.id !== postId));
          return 'success';
        }

        case 'LIKE_POST': {
          const postId = action.params?.postId;
          if (!postId) return 'error: missing postId';

          const filePath = getPostFilePath(postId);
          const post = await syncPostFromCloud(filePath);
          if (!post) return 'error: failed to sync post from cloud';

          setPosts((prev) => prev.map((p) => (p.id === postId ? post : p)));
          return 'success';
        }

        case 'UNLIKE_POST': {
          const postId = action.params?.postId;
          if (!postId) return 'error: missing postId';

          const filePath = getPostFilePath(postId);
          const post = await syncPostFromCloud(filePath);
          if (!post) return 'error: failed to sync post from cloud';

          setPosts((prev) => prev.map((p) => (p.id === postId ? post : p)));
          return 'success';
        }

        case 'COMMENT_POST': {
          const postId = action.params?.postId;
          if (!postId) return 'error: missing postId';

          const filePath = getPostFilePath(postId);
          const post = await syncPostFromCloud(filePath);
          if (!post) return 'error: failed to sync post from cloud';

          setPosts((prev) => prev.map((p) => (p.id === postId ? post : p)));
          return 'success';
        }

        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [syncPostFromCloud, removeByPath],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  // ============ Initialization ============
  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);

        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Twitter',
          windowStyle: { width: 600, height: 800 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Twitter',
          windowStyle: { width: 600, height: 800 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);

        // Fetch user / character / system settings (language auto-syncs to i18n)
        try {
          const vibeInfo = await fetchVibeInfo();
          console.log('[Twitter] System language settings:', {
            raw: vibeInfo.systemSettings?.language,
            currentLang: vibeInfo.systemSettings?.language?.current,
            i18nLang: i18n.language,
          });
          if (vibeInfo.userInfo) {
            currentUserRef.current = {
              name: vibeInfo.userInfo.nickname || FALLBACK_USER.name,
              username: `@${vibeInfo.userInfo.nickname || 'user'}`,
              avatar: vibeInfo.userInfo.avatarUrl || '',
            };
          }
        } catch (error) {
          console.warn('[Twitter] fetchVibeInfo failed:', error);
        }

        try {
          await initFromCloud();
        } catch (error) {
          console.warn('[Twitter] Cloud init failed, using local store:', error);
        }

        const loadedPosts = loadPostsFromFS();
        if (loadedPosts.length > 0) {
          setPosts(loadedPosts);
        }

        const savedState = loadState();
        if (savedState) {
          if (savedState.draftContent) {
            setDraftContent(savedState.draftContent);
          }
        }

        setIsInitialized(true);
        setIsLoading(false);

        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[Twitter] Init error:', error);
        setIsLoading(false);
        reportLifecycle(AppLifecycle.ERROR, String(error));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  // ============ Render ============
  return (
    <div className={styles.twitter}>
      <CreatePostForm
        onSubmit={handleCreatePost}
        draftContent={draftContent}
        onDraftChange={handleDraftChange}
        currentUserName={currentUserRef.current.name}
        currentUserAvatar={currentUserRef.current.avatar}
      />

      <div className={styles.feed}>
        {isLoading ? (
          <div className={styles.emptyState}>
            <div className={styles.spinner} />
          </div>
        ) : posts.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{t('empty')}</p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onLike={handleLikePost}
              onUnlike={handleUnlikePost}
              onDelete={handleDeletePost}
              onComment={handleCommentPost}
              isCurrentUser={post.author?.username === currentUserRef.current.username}
              currentUserName={currentUserRef.current.name}
              currentUserAvatar={currentUserRef.current.avatar}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Twitter;
