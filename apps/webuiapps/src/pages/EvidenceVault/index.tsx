import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import { useFileSystem, reportLifecycle, createAppFileApi, fetchVibeInfo } from '@/lib';
import {
  Folder,
  FileText,
  Video,
  Image as ImageIcon,
  Music,
  MessageSquare,
  Mail,
  FileSignature,
  ClipboardList,
  DollarSign,
  Search,
  Shield,
  AlertTriangle,
  Star,
  Lock,
  X,
  CheckCircle,
  XCircle,
  HelpCircle,
  Sparkles,
  Network,
  Users,
  Grid,
  Calendar,
  ChevronLeft,
  Archive,
} from 'lucide-react';
import styles from './index.module.scss';

// ============ Constants ============
const APP_ID = 13;
const APP_NAME = 'evidencevault';
const FILES_DIR = '/files';
const vaultFileApi = createAppFileApi(APP_NAME);

// ============ Type Definitions ============
type EvidenceType =
  | 'video'
  | 'log'
  | 'transaction'
  | 'document'
  | 'image'
  | 'audio'
  | 'chat'
  | 'email'
  | 'contract'
  | 'report'
  | 'trace'
  | 'relation';

type EvidenceCategory =
  | 'identity'
  | 'family'
  | 'money'
  | 'reputation'
  | 'incident'
  | 'secret'
  | 'other';

type EvidenceImpact = 'vindicate' | 'expose' | 'neutral' | 'mixed';

interface EvidenceFile {
  id: string;
  title: string;
  description: string;
  content: string;
  type: EvidenceType;
  category: EvidenceCategory;
  impact: EvidenceImpact;
  source: string;
  timestamp: number;
  credibility: number;
  importance: number;
  tags: string[];
  vindicateText?: string;
  exposeText?: string;
}

// ============ Icon Maps ============
const TYPE_ICONS: Record<EvidenceType, React.ReactNode> = {
  video: <Video size={18} />,
  log: <ClipboardList size={18} />,
  transaction: <DollarSign size={18} />,
  document: <FileText size={18} />,
  image: <ImageIcon size={18} />,
  audio: <Music size={18} />,
  chat: <MessageSquare size={18} />,
  email: <Mail size={18} />,
  contract: <FileSignature size={18} />,
  report: <ClipboardList size={18} />,
  trace: <Network size={18} />,
  relation: <Users size={18} />,
};

const TYPE_NAMES: Record<EvidenceType, string> = {
  video: 'VIDEO ARCHIVE',
  log: 'SYSTEM LOG',
  transaction: 'FINANCIAL RECORD',
  document: 'CLASSIFIED DOCUMENT',
  image: 'IMAGE FILE',
  audio: 'AUDIO RECORDING',
  chat: 'CHAT RECORD',
  email: 'EMAIL',
  contract: 'CONTRACT',
  report: 'INVESTIGATION REPORT',
  trace: 'LEAD TRACKING',
  relation: 'RELATIONSHIP MAP',
};

const CATEGORY_INFO: Record<
  EvidenceCategory,
  { name: string; icon: React.ReactNode; color: string }
> = {
  identity: { name: 'Identity', icon: <Shield size={16} />, color: '#7660FF' },
  family: { name: 'Family Files', icon: <Folder size={16} />, color: '#FF3F4D' },
  money: { name: 'Financial Data', icon: <DollarSign size={16} />, color: '#FAEA5F' },
  reputation: { name: 'Reputation', icon: <Star size={16} />, color: '#2EA7FF' },
  incident: { name: 'Incidents', icon: <AlertTriangle size={16} />, color: '#FF3F4D' },
  secret: { name: 'Classified', icon: <Lock size={16} />, color: '#6083FF' },
  other: { name: 'Other', icon: <Folder size={16} />, color: 'rgba(255,255,255,0.50)' },
};

const IMPACT_INFO: Record<EvidenceImpact, { label: string; color: string; icon: React.ReactNode }> =
  {
    vindicate: { label: 'POSITIVE', color: '#22c55e', icon: <CheckCircle size={14} /> },
    expose: { label: 'NEGATIVE', color: '#FF3F4D', icon: <XCircle size={14} /> },
    neutral: { label: 'NEUTRAL', color: 'rgba(255,255,255,0.50)', icon: <HelpCircle size={14} /> },
    mixed: { label: 'COMPLEX', color: '#FAEA5F', icon: <Sparkles size={14} /> },
  };

// ============ Sub-Components ============

/** Evidence Card */
const EvidenceCard: React.FC<{
  evidence: EvidenceFile;
  onClick: () => void;
}> = React.memo(({ evidence, onClick }) => {
  const typeIcon = TYPE_ICONS[evidence.type];
  const categoryInfo = CATEGORY_INFO[evidence.category];
  const impactInfo = IMPACT_INFO[evidence.impact];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={styles.card}
    >
      <div className={styles.cardIconContainer}>
        <div
          className={styles.cardIcon}
          style={{
            background: `${categoryInfo.color}15`,
            borderColor: `${categoryInfo.color}30`,
            color: categoryInfo.color,
          }}
        >
          {typeIcon}
        </div>
      </div>

      <div className={styles.cardContent}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{evidence.title}</h3>
          <div
            className={styles.cardTag}
            style={{
              color: categoryInfo.color,
              background: `${categoryInfo.color}10`,
              borderColor: `${categoryInfo.color}20`,
            }}
          >
            {categoryInfo.name}
          </div>
        </div>

        <p className={styles.cardDesc}>{evidence.description}</p>

        <div className={styles.cardMeta}>
          <div className={styles.cardMetaItem}>
            {impactInfo.icon}
            <span style={{ color: impactInfo.color, fontWeight: 500 }}>{impactInfo.label}</span>
          </div>
          <div className={styles.cardMetaItem}>
            <Calendar size={12} />
            <span>{new Date(evidence.timestamp).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

EvidenceCard.displayName = 'EvidenceCard';

/** Evidence Detail Modal */
const EvidenceDetail: React.FC<{
  evidence: EvidenceFile;
  onClose: () => void;
}> = React.memo(({ evidence, onClose }) => {
  const impactInfo = IMPACT_INFO[evidence.impact];

  return (
    <motion.div
      className={styles.detailOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.detailModal}
        initial={{ y: 50, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 50, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.detailHeader}>
          <div className={styles.detailHeaderLeft}>
            <button className={styles.detailBackBtn} onClick={onClose}>
              <ChevronLeft size={18} />
            </button>
            <div>
              <div className={styles.detailTypeLabel}>{TYPE_NAMES[evidence.type]}</div>
              <div className={styles.detailTitle}>{evidence.title}</div>
            </div>
          </div>

          <div className={styles.detailHeaderRight}>
            <div
              className={styles.detailImpactBadge}
              style={{
                background: `${impactInfo.color}20`,
                color: impactInfo.color,
              }}
            >
              {impactInfo.icon}
              {impactInfo.label}
            </div>
            <button className={styles.detailCloseBtn} onClick={onClose}>
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={styles.detailBody}>
          <div className={styles.detailInner}>
            {/* Metadata Grid */}
            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>DATE</div>
                <div className={styles.metaValue}>
                  {new Date(evidence.timestamp).toLocaleDateString()}
                </div>
              </div>
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>SOURCE</div>
                <div className={styles.metaValue}>{evidence.source}</div>
              </div>
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>CREDIBILITY</div>
                <div
                  className={styles.metaValue}
                  style={{ color: evidence.credibility > 80 ? '#22c55e' : '#FAEA5F' }}
                >
                  {evidence.credibility}%
                </div>
              </div>
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>IMPORTANCE</div>
                <div className={styles.metaValue}>
                  {evidence.importance >= 80
                    ? 'CRITICAL'
                    : evidence.importance >= 50
                      ? 'HIGH'
                      : 'NORMAL'}
                </div>
              </div>
            </div>

            {/* Tags */}
            {evidence.tags.length > 0 && (
              <div className={styles.tagsSection}>
                {evidence.tags.map((tag) => (
                  <span key={tag} className={styles.tagItem}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            <div className={styles.detailSection}>
              <h4 className={styles.sectionTitle}>DESCRIPTION</h4>
              <p className={styles.sectionText}>{evidence.description}</p>
            </div>

            {/* Content */}
            <div className={styles.detailSection}>
              <h4 className={styles.sectionTitle}>EVIDENCE CONTENT</h4>
              <div className={styles.contentBlock}>{evidence.content}</div>
            </div>

            {/* Impact Analysis */}
            {(evidence.vindicateText || evidence.exposeText) && (
              <div className={styles.impactGrid}>
                {evidence.vindicateText && (
                  <div className={styles.impactPositive}>
                    <div className={styles.impactLabel}>
                      <CheckCircle size={16} /> POSITIVE IMPACT
                    </div>
                    <p className={styles.impactText}>{evidence.vindicateText}</p>
                  </div>
                )}
                {evidence.exposeText && (
                  <div className={styles.impactNegative}>
                    <div className={styles.impactLabel}>
                      <XCircle size={16} /> NEGATIVE IMPACT
                    </div>
                    <p className={styles.impactText}>{evidence.exposeText}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

EvidenceDetail.displayName = 'EvidenceDetail';

// ============ Main Component ============
const EvidenceVault: React.FC = () => {
  // --- State ---
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<EvidenceCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<EvidenceFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);

  const isCompact = containerWidth < 600;

  // --- File System ---
  const { initFromCloud, getChildrenByPath } = useFileSystem({
    fileApi: vaultFileApi,
  });

  // --- Container resize ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((obs) => {
      for (const entry of obs) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // --- Load files from FS ---
  const loadFilesFromFS = useCallback((): EvidenceFile[] => {
    const children = getChildrenByPath(FILES_DIR);
    return children
      .filter((n) => n.type === 'file' && n.content !== null)
      .map((n) => {
        let file: EvidenceFile;
        if (typeof n.content === 'string') {
          try {
            file = JSON.parse(n.content);
          } catch {
            return null;
          }
        } else {
          file = n.content as EvidenceFile;
        }
        return {
          ...file,
          title: file.title || '',
          description: file.description || '',
          content: file.content || '',
          tags: file.tags || [],
        };
      })
      .filter((e): e is EvidenceFile => e !== null && !!e.id);
  }, [getChildrenByPath]);

  // --- Filtered & sorted files ---
  const filteredFiles = useMemo(() => {
    let result = files;

    if (selectedCategory !== 'all') {
      result = result.filter((e) => e.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(query) ||
          e.description.toLowerCase().includes(query) ||
          e.content.toLowerCase().includes(query) ||
          e.tags.some((t) => t.toLowerCase().includes(query)),
      );
    }

    return result.sort((a, b) => b.importance - a.importance);
  }, [files, selectedCategory, searchQuery]);

  // --- Category stats ---
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = { all: files.length };
    for (const cat of Object.keys(CATEGORY_INFO)) {
      stats[cat] = files.filter((f) => f.category === cat).length;
    }
    return stats;
  }, [files]);

  // --- Event handlers ---
  const handleOpenFile = useCallback((file: EvidenceFile) => {
    setSelectedFile(file);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const handleCategoryChange = useCallback((category: EvidenceCategory | 'all') => {
    setSelectedCategory(category);
  }, []);

  // --- Initialization ---
  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);
        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'EvidenceVault',
          windowStyle: { width: 960, height: 640 },
        });
        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'EvidenceVault',
          windowStyle: { width: 960, height: 640 },
        });
        reportLifecycle(AppLifecycle.DOM_READY);

        try {
          await fetchVibeInfo();
        } catch (err) {
          console.warn('[EvidenceVault] fetchVibeInfo failed:', err);
        }

        try {
          await initFromCloud();
        } catch (err) {
          console.warn('[EvidenceVault] Cloud init failed:', err);
        }

        const loaded = loadFilesFromFS();
        if (loaded.length > 0) setFiles(loaded);

        setIsLoading(false);
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (err) {
        console.error('[EvidenceVault] Init error:', err);
        setError(String(err));
        setIsLoading(false);
        reportLifecycle(AppLifecycle.ERROR, String(err));
      }
    };
    init();
    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  // ============ Render ============

  if (error) {
    return (
      <div className={styles.vault} ref={containerRef}>
        <div className={styles.errorState}>
          <AlertTriangle size={48} style={{ opacity: 0.3 }} />
          <div className={styles.errorTitle}>SYSTEM ERROR</div>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.vault} ref={containerRef}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.vault} ref={containerRef}>
      {/* Sidebar */}
      {!isCompact && (
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarTitle}>ARCHIVES</div>
            <div className={styles.sidebarSubtitle}>CLASSIFIED DATA VAULT</div>
          </div>

          <div className={styles.sidebarNav}>
            <div
              className={`${styles.navItem} ${selectedCategory === 'all' ? styles.navActive : ''}`}
              onClick={() => handleCategoryChange('all')}
            >
              <Grid size={18} />
              <span>All Files</span>
              <span className={styles.navCount}>{categoryStats.all}</span>
            </div>

            <div className={styles.navDivider} />

            {(Object.keys(CATEGORY_INFO) as EvidenceCategory[]).map((cat) => {
              const info = CATEGORY_INFO[cat];
              const count = categoryStats[cat] || 0;

              return (
                <div
                  key={cat}
                  className={`${styles.navItem} ${selectedCategory === cat ? styles.navActive : ''}`}
                  onClick={() => handleCategoryChange(cat)}
                >
                  {info.icon}
                  <span>{info.name}</span>
                  {count > 0 && <span className={styles.navCount}>{count}</span>}
                </div>
              );
            })}
          </div>

          <div className={styles.sidebarFooter}>
            <div className={styles.statusLabel}>System Status</div>
            <div className={styles.statusRow}>
              <div className={styles.statusDot} />
              <div className={styles.statusText}>ONLINE</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            {isCompact && <Archive size={18} style={{ opacity: 0.5, marginRight: 8 }} />}
            <div className={styles.headerDecoration} />
            {selectedCategory === 'all' ? 'All Files' : CATEGORY_INFO[selectedCategory].name}
          </div>

          <div className={styles.headerActions}>
            {isCompact && (
              <select
                className={styles.categorySelect}
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value as EvidenceCategory | 'all')}
              >
                <option value="all">All ({categoryStats.all})</option>
                {(Object.keys(CATEGORY_INFO) as EvidenceCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_INFO[cat].name} ({categoryStats[cat] || 0})
                  </option>
                ))}
              </select>
            )}

            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search evidence..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className={styles.content}>
          {filteredFiles.length === 0 ? (
            <div className={styles.emptyState}>
              <Folder size={64} style={{ opacity: 0.15 }} />
              <div className={styles.emptyText}>NO DATA FOUND</div>
            </div>
          ) : (
            <div className={styles.grid}>
              <AnimatePresence mode="popLayout">
                {filteredFiles.map((file) => (
                  <EvidenceCard
                    key={file.id}
                    evidence={file}
                    onClick={() => handleOpenFile(file)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedFile && (
          <EvidenceDetail
            key={selectedFile.id}
            evidence={selectedFile}
            onClose={handleCloseDetail}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default EvidenceVault;
