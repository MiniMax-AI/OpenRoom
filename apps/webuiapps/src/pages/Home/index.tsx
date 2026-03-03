import { useTranslation } from 'react-i18next';
import styles from './index.module.scss';
import i18next from 'i18next';
import { ENABLE_LOCALES } from '@/i18/config';

const Home = () => {
  const { t } = useTranslation();
  return (
    <div className={styles.home}>
      <h1>{t('home')}</h1>
      <p>Current Lang: {i18next.language}</p>
      <div>
        <h2>{t('changeLang')}</h2>
        {ENABLE_LOCALES.map((lng) => (
          <button className={styles.langBtn} key={lng} onClick={() => i18next.changeLanguage(lng)}>
            {lng}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Home;
