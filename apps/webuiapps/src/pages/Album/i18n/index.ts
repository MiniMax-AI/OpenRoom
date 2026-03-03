import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import zh from './zh';

const NAMESPACE = 'album';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { [NAMESPACE]: en },
      zh: { [NAMESPACE]: zh },
    },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: NAMESPACE,
    ns: [NAMESPACE],
    interpolation: {
      escapeValue: false,
    },
  });
} else {
  i18n.addResourceBundle('en', NAMESPACE, en, true, true);
  i18n.addResourceBundle('zh', NAMESPACE, zh, true, true);
}

export { NAMESPACE };
export default i18n;
