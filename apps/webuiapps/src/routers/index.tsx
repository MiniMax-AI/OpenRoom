import React, { lazy } from 'react';
import { RouteObject } from 'react-router-dom';
import { cleanNil } from '@/utils/nil';

const Shell = lazy(() => import('@/components/Shell'));
const Home = lazy(() => import('@/pages/Home'));
const Twitter = lazy(() => import('@/pages/Twitter'));
const MusicApp = lazy(() => import('@/pages/MusicApp'));
const Diary = lazy(() => import('@/pages/Diary'));
const Album = lazy(() => import('@/pages/Album'));
const FreeCell = lazy(() => import('@/pages/FreeCell'));
const Email = lazy(() => import('@/pages/Email'));
const Gomoku = lazy(() => import('@/pages/Gomoku'));
const Chess = lazy(() => import('@/pages/Chess'));
const EvidenceVault = lazy(() => import('@/pages/EvidenceVault'));
const CyberNews = lazy(() => import('@/pages/CyberNews'));

// All sub-pages should use lazy loading
const routerList: RouteObject[] = [
  {
    path: '/home',
    element: (
      <React.Suspense>
        <Home />
      </React.Suspense>
    ),
  },
  {
    path: '/twitter',
    element: (
      <React.Suspense>
        <Twitter />
      </React.Suspense>
    ),
  },
  {
    path: '/musicPlayer',
    element: (
      <React.Suspense>
        <MusicApp />
      </React.Suspense>
    ),
  },
  {
    path: '/diary',
    element: (
      <React.Suspense>
        <Diary />
      </React.Suspense>
    ),
  },
  {
    path: '/album',
    element: (
      <React.Suspense>
        <Album />
      </React.Suspense>
    ),
  },
  {
    path: '/freecell',
    element: (
      <React.Suspense>
        <FreeCell />
      </React.Suspense>
    ),
  },
  {
    path: '/email',
    element: (
      <React.Suspense>
        <Email />
      </React.Suspense>
    ),
  },
  {
    path: '/gomoku',
    element: (
      <React.Suspense>
        <Gomoku />
      </React.Suspense>
    ),
  },
  {
    path: '/chess',
    element: (
      <React.Suspense>
        <Chess />
      </React.Suspense>
    ),
  },
  {
    path: '/evidencevault',
    element: (
      <React.Suspense>
        <EvidenceVault />
      </React.Suspense>
    ),
  },
  {
    path: '/cyberNews',
    element: (
      <React.Suspense>
        <CyberNews />
      </React.Suspense>
    ),
  },
];

interface RouterItemConfig {
  path?: RouteObject['path'];
  element?: RouteObject['element'];
  children?: RouteObject['children'];
  index?: RouteObject['index'];
  /** Methods and meta properties passed from router to page */
  handle?: RouteObject['handle'];
  meta?: Record<string, unknown>;
}

const generateRootRouter = (list: RouterItemConfig[]): RouteObject[] => {
  const traverse = (config: RouterItemConfig) => {
    const temp = cleanNil({
      path: config?.path,
      element: config?.element,
      index: config?.index,
      handle: config?.meta
        ? {
            meta: config.meta,
          }
        : undefined,
    });
    if (!config?.children?.length) {
      return temp;
    }
    temp.children = config.children.map(traverse);
    return temp;
  };
  return list.map(traverse);
};

// Local dev compatibility: add /webuiapps-prefixed copies for all routes,
// so paths like /webuiapps/diary also match the corresponding page
const prefixedRoutes: RouteObject[] = routerList
  .filter((r) => r.path)
  .map((r) => ({ ...r, path: `/webuiapps${r.path}` }));

// Standalone mode: Shell as root with desktop + floating windows
const standaloneMode = true;

const rootRouter: RouteObject[] = standaloneMode
  ? [
      {
        path: '*',
        element: (
          <React.Suspense>
            <Shell />
          </React.Suspense>
        ),
      },
    ]
  : generateRootRouter([...routerList, ...prefixedRoutes]);

export default rootRouter;
