/**
 * App Action Registry
 *
 * Static info (appId, appName, route, displayName) is defined in code.
 * Action definitions are dynamically loaded from each App's meta.yaml (stored on disk).
 */

import * as idb from './diskStorage';

// ============ Type Definitions ============

export interface AppActionDef {
  name: string;
  description: string;
  params: Array<{
    name: string;
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
  }>;
}

export interface AppDef {
  appId: number;
  appName: string;
  route: string;
  displayName: string;
  actions: AppActionDef[];
}

// ============ Static App Registry (without actions) ============

interface AppStaticDef {
  appId: number;
  appName: string;
  route: string;
  displayName: string;
  /** Source directory name (under src/pages/), not present for OS */
  sourceDir?: string;
  /** Lucide icon name */
  icon?: string;
  /** Desktop icon color */
  color?: string;
  /** Default window size */
  defaultSize?: { width: number; height: number };
}

const APP_STATIC_REGISTRY: AppStaticDef[] = [
  { appId: 1, appName: 'os', route: '/home', displayName: 'OS' },
  {
    appId: 2,
    appName: 'twitter',
    route: '/twitter',
    displayName: 'X',
    sourceDir: 'Twitter',
    icon: 'X',
    color: '#ffffff',
    defaultSize: { width: 400, height: 500 },
  },
  {
    appId: 3,
    appName: 'youtube',
    route: '/youtube',
    displayName: 'YouTube',
    sourceDir: 'YouTubeApp',
    icon: 'Youtube',
    color: '#ff0000',
    defaultSize: { width: 960, height: 640 },
  },
  {
    appId: 4,
    appName: 'diary',
    route: '/diary',
    displayName: 'Diary',
    sourceDir: 'Diary',
    icon: 'BookOpen',
    color: '#faea5f',
    defaultSize: { width: 880, height: 480 },
  },
  {
    appId: 8,
    appName: 'album',
    route: '/album',
    displayName: 'Album',
    sourceDir: 'Album',
    icon: 'Image',
    color: '#58a6ff',
    defaultSize: { width: 640, height: 440 },
  },
  {
    appId: 9,
    appName: 'gomoku',
    route: '/gomoku',
    displayName: 'Gomoku',
    sourceDir: 'Gomoku',
    icon: 'Circle',
    color: '#f97316',
    defaultSize: { width: 600, height: 600 },
  },
  {
    appId: 10,
    appName: 'freecell',
    route: '/freecell',
    displayName: 'FreeCell',
    sourceDir: 'FreeCell',
    icon: 'LayoutGrid',
    color: '#22c55e',
    defaultSize: { width: 700, height: 500 },
  },
  {
    appId: 11,
    appName: 'email',
    route: '/email',
    displayName: 'Email',
    sourceDir: 'Email',
    icon: 'Mail',
    color: '#a78bfa',
    defaultSize: { width: 540, height: 480 },
  },
  {
    appId: 12,
    appName: 'chess',
    route: '/chess',
    displayName: 'Chess',
    sourceDir: 'Chess',
    icon: 'Crown',
    color: '#eab308',
    defaultSize: { width: 700, height: 600 },
  },
  {
    appId: 13,
    appName: 'evidencevault',
    route: '/evidencevault',
    displayName: 'Evidence Vault',
    sourceDir: 'EvidenceVault',
    icon: 'Shield',
    color: '#ef4444',
    defaultSize: { width: 700, height: 500 },
  },
  {
    appId: 14,
    appName: 'cyberNews',
    route: '/cyberNews',
    displayName: 'Hacker News',
    sourceDir: 'CyberNews',
    icon: 'Flame',
    color: '#ff6600',
    defaultSize: { width: 1100, height: 750 },
  },
  {
    appId: 15,
    appName: 'bookwriter',
    route: '/bookwriter',
    displayName: 'Book Writer',
    sourceDir: 'BookWriter',
    icon: 'BookOpen',
    color: '#d4a574',
    defaultSize: { width: 880, height: 600 },
  },
  {
    appId: 16,
    appName: 'memoryvault',
    route: '/memoryvault',
    displayName: 'Memory Vault',
    sourceDir: 'MemoryVault',
    icon: 'Heart',
    color: '#ff7aa2',
    defaultSize: { width: 880, height: 600 },
  },
  {
    appId: 17,
    appName: 'mystery',
    route: '/mystery',
    displayName: 'Mystery',
    sourceDir: 'MysteryApp',
    icon: 'Search',
    color: '#d4a574',
    defaultSize: { width: 960, height: 680 },
  },
  {
    appId: 18,
    appName: 'light',
    route: '/light',
    displayName: 'Light',
    sourceDir: 'Light',
    icon: 'Lightbulb',
    color: '#fbbf24',
    defaultSize: { width: 320, height: 520 },
  },
];

// OS actions are built-in system actions, not from meta.yaml
const OS_ACTIONS: AppActionDef[] = [
  {
    name: 'OPEN_APP',
    description: 'Open a specified app. Pass app_id as the application ID',
    params: [
      {
        name: 'app_id',
        type: 'string',
        description: `Application ID (${APP_STATIC_REGISTRY.filter((a) => a.appName !== 'os')
          .map((a) => `${a.appId}=${a.displayName}`)
          .join(', ')})`,
        required: true,
      },
    ],
  },
  {
    name: 'CLOSE_APP',
    description: 'Close a specified app. Pass app_id as the application ID',
    params: [{ name: 'app_id', type: 'string', description: 'Application ID', required: true }],
  },
  {
    name: 'SET_WALLPAPER',
    description:
      'Change the desktop wallpaper. wallpaper_url must be a https URL or a data URL (data:image/...). ' +
      'You can use the dataUrl returned by generate_image, or any https image/video URL.',
    params: [
      {
        name: 'wallpaper_url',
        type: 'string',
        description: 'https URL or data URL for the wallpaper',
        required: true,
      },
    ],
  },
];

// ============ Helper Query Functions ============

export function getAppDisplayName(appId: number): string {
  return APP_STATIC_REGISTRY.find((a) => a.appId === appId)?.displayName ?? `App ${appId}`;
}

/**
 * Reverse-lookup an app's numeric id by its canonical short name
 * (e.g. "chess" → 12). Case-insensitive. Returns null if no match.
 */
export function findAppIdByName(name: string): number | null {
  if (!name) return null;
  const needle = name.toLowerCase();
  const hit = APP_STATIC_REGISTRY.find((a) => a.appName.toLowerCase() === needle);
  return hit ? hit.appId : null;
}

export function getAppDefaultSize(appId: number): { width: number; height: number } {
  return (
    APP_STATIC_REGISTRY.find((a) => a.appId === appId)?.defaultSize ?? { width: 600, height: 400 }
  );
}

/** Returns all desktop Apps (excluding OS), used for Shell desktop icons */
export function getDesktopApps(): Array<{
  appId: number;
  displayName: string;
  icon: string;
  color: string;
}> {
  return APP_STATIC_REGISTRY.filter((a) => a.appName !== 'os' && a.icon && a.color).map((a) => ({
    appId: a.appId,
    displayName: a.displayName,
    icon: a.icon!,
    color: a.color!,
  }));
}

/** Source directory name to appName mapping, used for seedMeta */
export function getSourceDirToAppName(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const app of APP_STATIC_REGISTRY) {
    if (app.sourceDir) map[app.sourceDir] = app.appName;
  }
  return map;
}

/** sourceDir to appId mapping, used for AppWindow dynamic component loading */
export function getSourceDirToAppId(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const app of APP_STATIC_REGISTRY) {
    if (app.sourceDir) map[app.sourceDir] = app.appId;
  }
  return map;
}

// ============ Full Registry After Dynamic Loading ============

/** Full APP_REGISTRY, including dynamically loaded actions */
export let APP_REGISTRY: AppDef[] = APP_STATIC_REGISTRY.map((app) => ({
  ...app,
  actions: app.appName === 'os' ? OS_ACTIONS : [],
}));

// ============ Meta.yaml Parsing ============

/**
 * Parse action definitions from meta.yaml
 * Standard array format: actions: [{ type, name, description, params: [{ name, type, ... }] }]
 */
function parseMetaYamlActions(yamlContent: string): AppActionDef[] {
  const actions: AppActionDef[] = [];

  // Check for actions: [] (inline empty)
  if (/^actions:\s*\[\]\s*$/m.test(yamlContent)) return actions;

  // Find the actions: section
  const actionsMatch = yamlContent.match(/^actions:\s*$/m);
  if (!actionsMatch) return actions;

  const actionsStart = actionsMatch.index! + actionsMatch[0].length;
  const restContent = yamlContent.slice(actionsStart);

  const lines = restContent.split('\n');
  parseStandardActions(lines, actions);

  return actions;
}

function parseStandardActions(lines: string[], actions: AppActionDef[]): void {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Stop parsing the actions block when encountering a non-indented non-empty line (top-level key)
    if (line.match(/^\S/) && line.trim() !== '') break;

    const typeMatch = line.match(/^\s+-\s+type:\s+(\S+)/);
    if (typeMatch) {
      const action: AppActionDef = { name: typeMatch[1], description: '', params: [] };
      i++;
      // Parse this action's properties
      while (i < lines.length) {
        const l = lines[i];
        if (l.match(/^\s+-\s+type:\s/) || (l.match(/^\S/) && l.trim() !== '')) break;

        const descMatch = l.match(/^\s+description:\s*>?\s*$/);
        if (descMatch) {
          // Multi-line description
          i++;
          const descLines: string[] = [];
          while (i < lines.length && lines[i].match(/^\s{6,}/) && !lines[i].match(/^\s+\w+:/)) {
            descLines.push(lines[i].trim());
            i++;
          }
          action.description = descLines.join(' ');
          continue;
        }
        const descInlineMatch = l.match(/^\s+description:\s+(.+)$/);
        if (descInlineMatch) {
          action.description = descInlineMatch[1].trim();
          i++;
          continue;
        }

        const paramsMatch = l.match(/^\s+params:\s*$/);
        if (paramsMatch) {
          i++;
          parseParamsList(lines, i, action.params, (newI) => {
            i = newI;
          });
          continue;
        }
        // params: [] (empty)
        if (l.match(/^\s+params:\s*\[\]\s*$/)) {
          i++;
          continue;
        }

        i++;
      }
      actions.push(action);
    } else {
      i++;
    }
  }
}

function parseParamsList(
  lines: string[],
  startI: number,
  params: AppActionDef['params'],
  setI: (i: number) => void,
): void {
  let i = startI;
  while (i < lines.length) {
    const l = lines[i];
    // Parameter items start with "      - name:"
    const paramNameMatch = l.match(/^\s+-\s+name:\s+(\S+)/);
    if (!paramNameMatch) break;

    const param: AppActionDef['params'][0] = {
      name: paramNameMatch[1],
      type: 'string',
      description: paramNameMatch[1],
    };
    i++;
    while (i < lines.length) {
      const pl = lines[i];
      if (pl.match(/^\s+-\s+name:\s/) || !pl.match(/^\s{8,}/)) break;

      const typeMatch = pl.match(/^\s+type:\s+(\S+)/);
      if (typeMatch) {
        param.type = typeMatch[1];
        i++;
        continue;
      }
      const descMatch = pl.match(/^\s+description:\s+(.+)$/);
      if (descMatch) {
        param.description = descMatch[1].trim();
        i++;
        continue;
      }
      const reqMatch = pl.match(/^\s+required:\s+(true|false)/);
      if (reqMatch) {
        param.required = reqMatch[1] === 'true';
        i++;
        continue;
      }
      const enumMatch = pl.match(/^\s+enum:\s+\[(.+)\]/);
      if (enumMatch) {
        param.enum = enumMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
        i++;
        continue;
      }
      i++;
    }
    params.push(param);
  }
  setI(i);
}

// ============ Dynamic Loading ============

let _loaded = false;

/**
 * Load all App meta.yaml from disk storage, parse actions and populate APP_REGISTRY.
 * Should be called once before ChatPanel first uses tool definitions.
 */
export async function loadActionsFromMeta(): Promise<void> {
  if (_loaded) return;

  const loaded: AppDef[] = [];

  for (const app of APP_STATIC_REGISTRY) {
    if (app.appName === 'os') {
      loaded.push({ ...app, actions: OS_ACTIONS });
      continue;
    }

    const metaPath = `apps/${app.appName}/meta.yaml`;
    try {
      const content = await idb.getFile(metaPath);
      if (content && typeof content === 'string') {
        const actions = parseMetaYamlActions(content);
        loaded.push({ ...app, actions });
      } else {
        loaded.push({ ...app, actions: [] });
      }
    } catch {
      loaded.push({ ...app, actions: [] });
    }
  }

  APP_REGISTRY = loaded;
  _loaded = true;
}

/**
 * Reset loading state, forcing a reload on next call to loadActionsFromMeta
 */
export function resetActionsCache(): void {
  _loaded = false;
}

// ============ Tool Definition Generation ============

/**
 * Single generic app_action tool that replaces per-app tool definitions.
 * LLM discovers available actions by reading meta.yaml via file tools.
 */
export function getAppActionToolDefinition(): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: { type: 'object'; properties: Record<string, unknown>; required: string[] };
  };
} {
  return {
    type: 'function',
    function: {
      name: 'app_action',
      description:
        "Trigger an action on an app. Read the app's meta.yaml first to discover available action types and their parameters. " +
        'OS-level actions (OPEN_APP, CLOSE_APP, SET_WALLPAPER) MUST use app_name="os".',
      parameters: {
        type: 'object',
        properties: {
          app_name: {
            type: 'string',
            description: 'The appName of the target app (from list_apps)',
          },
          action_type: {
            type: 'string',
            description: 'The action type to trigger (e.g. REFRESH_TRACKS, SYNC_STATE, OPEN_APP)',
          },
          params: {
            type: 'string',
            description: 'JSON string of action parameters, e.g. \'{"trackId":"123"}\'',
          },
        },
        required: ['app_name', 'action_type'],
      },
    },
  };
}

/**
 * Execute the generic app_action tool call.
 * Returns { appId, actionType, params } for dispatch, or an error string.
 */
export function resolveAppAction(
  appName: string,
  actionType: string,
): { appId: number; actionType: string } | string {
  const app = APP_REGISTRY.find((a) => a.appName === appName);
  if (!app) return `error: unknown app "${appName}". Call list_apps to see available apps.`;
  return { appId: app.appId, actionType };
}

// ============ list_apps Tool ============

export function getListAppsToolDefinition(): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: { type: 'object'; properties: Record<string, unknown>; required: string[] };
  };
} {
  return {
    type: 'function',
    function: {
      name: 'list_apps',
      description:
        'List all available apps on the device. Returns app names and display names. Call this first to discover what apps are available.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  };
}

export function executeListApps(): string {
  const apps = APP_REGISTRY.filter((a) => a.appName !== 'os').map(
    (a) => `${a.displayName} (appId: ${a.appId}, appName: ${a.appName})`,
  );
  return (
    `Available apps:\n${apps.join('\n')}\n\n` +
    'OS-level actions (use app_name="os"):\n' +
    '- OPEN_APP: open an app (params: app_id)\n' +
    '- CLOSE_APP: close an app (params: app_id)\n' +
    '- SET_WALLPAPER: change wallpaper (params: wallpaper_url)'
  );
}
