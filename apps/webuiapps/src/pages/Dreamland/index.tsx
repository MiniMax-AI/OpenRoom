import React, { useEffect, useMemo, useState } from 'react';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  createAppFileApi,
  fetchVibeInfo,
  reportAction,
  reportLifecycle,
  useAgentActionListener,
} from '@/lib';
import i18n, { NAMESPACE } from './i18n';
import { APP_ID, APP_NAME } from './actions/constants';
import { createAgentActionHandler } from './actions/agentActionHandler';
import { createDreamspaceRepository } from './repositories/dreamspaceRepository';
import { createStateRepository } from './repositories/stateRepository';
import { backgroundGenerator } from './services/backgroundGenerator';
import { AmbientAudio } from './services/ambientAudio';
import { DreamlandController } from './store/controller';
import { DreamlandProvider } from './store/DreamlandContext';
import DreamlandApp from './components/DreamlandApp';
import seedDreams from './data/seed-dreams.json';
import styles from './index.module.scss';

const WINDOW = {
  id: APP_ID,
  type: 'page',
  name: 'Dreamland',
  windowStyle: { width: 900, height: 620 },
};

const Dreamland: React.FC = () => {
  const [audio] = useState(() => new AmbientAudio());
  const controller = useMemo(() => {
    const api = createAppFileApi(APP_NAME);
    return new DreamlandController({
      dreams: createDreamspaceRepository(api),
      state: createStateRepository(api),
      generator: backgroundGenerator,
      audio,
      report: (type, params) => reportAction(APP_ID, type, params),
      t: (key, options) => i18n.t(key, { ns: NAMESPACE, ...options }),
      seeds: seedDreams as unknown[],
    });
  }, [audio]);

  const handleAgentAction = useMemo(() => createAgentActionHandler(controller), [controller]);
  useAgentActionListener(APP_ID, handleAgentAction);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);
        const manager = await initVibeApp({ ...WINDOW, url: window.location.href });
        manager.handshake({ ...WINDOW, url: window.location.href });
        reportLifecycle(AppLifecycle.DOM_READY);
        try {
          await fetchVibeInfo();
        } catch (error) {
          console.warn('[Dreamland] fetchVibeInfo failed:', error);
        }
        await controller.init();
        if (cancelled) return;
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[Dreamland] Init error:', error);
        reportLifecycle(AppLifecycle.ERROR, String(error));
      }
    };
    void init();
    return () => {
      cancelled = true;
      controller.dispose();
      audio.dispose();
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, [controller, audio]);

  return (
    <div className={`${styles.root} ${styles.tokens}`}>
      <DreamlandProvider controller={controller}>
        <DreamlandApp />
      </DreamlandProvider>
    </div>
  );
};

export default Dreamland;
