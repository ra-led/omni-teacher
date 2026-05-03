import Link from 'next/link';

const INVESTOR_DECK_URL = process.env.NEXT_PUBLIC_INVESTOR_DECK_URL ?? '/investors-static';

export default function InvestorsPage() {
  return (
    <div className="investors-shell">
      <header className="investors-header">
        <div>
          <p>Раздел</p>
          <h1>Инвесторам</h1>
        </div>
        <div className="investors-header__actions">
          <Link href="/" className="ot-btn ot-btn--ghost">
            На лендинг
          </Link>
          <a href={INVESTOR_DECK_URL} target="_blank" rel="noreferrer" className="ot-btn ot-btn--primary">
            Открыть standalone-версию
          </a>
        </div>
      </header>

      <p className="investors-note">
        Здесь встроена текущая версия `omni-teacher-web` как отдельный investor-ready материал.
      </p>

      <div className="investors-frame-wrap">
        <iframe
          title="Omni Teacher Investors"
          src={INVESTOR_DECK_URL}
          className="investors-frame"
          loading="lazy"
        />
      </div>
    </div>
  );
}
