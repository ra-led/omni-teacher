import Link from 'next/link';

const painPoints = [
  {
    title: 'Ребёнок теряет интерес к учёбе',
    description:
      'Omni Teacher превращает сложные темы в понятные квесты и поддерживает мотивацию через диалог, голос и визуальные объяснения.',
  },
  {
    title: 'Родителям не видно реального прогресса',
    description:
      'Платформа показывает понятные метрики: динамику навыков, сложные зоны и персональные рекомендации по следующим шагам.',
  },
  {
    title: 'Школам нужны измеримые результаты',
    description:
      'Единый контур для учеников, родителей и педагогов с прозрачной аналитикой и инфраструктурой, готовой к пилотам.',
  },
];

const metrics = [
  { value: '3 режима', label: 'текст, голос, изображения' },
  { value: '1 платформа', label: 'для семей и школ' },
  { value: '24/7', label: 'доступ к персональному наставнику' },
];

export default function LandingPage() {
  return (
    <div className="ot-landing">
      <header className="ot-nav">
        <div className="ot-nav__brand">
          <span className="ot-nav__logo">OT</span>
          <div>
            <strong>Omni Teacher</strong>
            <p>Персональный ИИ-учитель для каждого ребёнка</p>
          </div>
        </div>
        <nav>
          <Link href="#benefits">Преимущества</Link>
          <Link href="#how">Как это работает</Link>
          <Link href="/investors">Инвесторам</Link>
          <Link className="ot-nav__cta" href="/platform">
            Открыть платформу
          </Link>
        </nav>
      </header>

      <section className="ot-hero">
        <p className="ot-hero__eyebrow">EdTech + AI + measurable outcomes</p>
        <h1>
          Лэндинг, который продаёт не обещания,
          <span> а понятный результат для детей, родителей и школ.</span>
        </h1>
        <p className="ot-hero__lead">
          Omni Teacher адаптирует обучение под каждого ученика, объясняет сложное простым языком и
          даёт взрослым прозрачную картину прогресса в реальном времени.
        </p>
        <div className="ot-hero__actions">
          <Link className="ot-btn ot-btn--primary" href="/platform">
            Запустить демо
          </Link>
          <Link className="ot-btn ot-btn--ghost" href="/investors">
            Материалы для инвесторов
          </Link>
        </div>
        <div className="ot-metrics">
          {metrics.map((metric) => (
            <article key={metric.value}>
              <strong>{metric.value}</strong>
              <p>{metric.label}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="benefits" className="ot-section">
        <h2>Почему это покупают и внедряют</h2>
        <div className="ot-cards">
          {painPoints.map((point) => (
            <article key={point.title} className="ot-card">
              <h3>{point.title}</h3>
              <p>{point.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="ot-section ot-section--highlight">
        <h2>Как работает в 3 шага</h2>
        <ol>
          <li>Диагностика текущего уровня и целей ученика.</li>
          <li>Персональная программа с адаптивными уроками и заданиями.</li>
          <li>Отчёт о прогрессе и следующие рекомендации для взрослых.</li>
        </ol>
      </section>

      <section className="ot-cta">
        <h2>Готовы показать это фонду, школе или партнёрам?</h2>
        <p>
          Раздел <strong>«Инвесторам»</strong> теперь вынесен отдельно, а продуктовая платформа доступна в
          одном клике.
        </p>
        <div className="ot-hero__actions">
          <Link className="ot-btn ot-btn--primary" href="/investors">
            Перейти в раздел инвесторам
          </Link>
          <Link className="ot-btn ot-btn--ghost" href="/platform">
            Перейти в продукт
          </Link>
        </div>
      </section>
    </div>
  );
}
