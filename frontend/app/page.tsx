import Link from 'next/link';

const ageSegments = [
  {
    age: '5-8',
    title: 'Мягкий старт',
    text: 'Истории, голосовые подсказки и спокойный темп для первых учебных побед.',
  },
  {
    age: '9-12',
    title: 'Уверенный прогресс',
    text: 'Практика, челленджи и видимый рост без ощущения слишком детского продукта.',
  },
  {
    age: '13-17',
    title: 'Экзамены и ясность',
    text: 'Домашка, эссе, тесты и точечная работа со слабыми местами без сюсюканья.',
  },
];

const tldrCards = [
  { label: 'Для кого', value: 'дети 5-17 лет', tone: 'blue' },
  { label: 'Первый результат', value: 'план после диагностики', tone: 'teal' },
  { label: 'Контроль', value: 'родитель видит прогресс', tone: 'amber' },
  { label: 'Формат', value: 'чат, голос, изображения', tone: 'indigo' },
];

const proofItems = [
  'Пробный старт без оплаты',
  'Родитель видит, что уже освоено',
  'Занятия без рекламы и лишних отвлечений',
];

const productFlow = [
  'Диагностика',
  'Объяснение',
  'Практика',
  'Оценка освоения',
];

const valueProps = [
  {
    title: 'Маршрут под ребёнка',
    text: 'Сервис определяет уровень, пробелы и цель, а затем собирает программу вместо пустого чата.',
    metric: '4 шага',
  },
  {
    title: 'Безопасность рядом с CTA',
    text: 'Родительский контроль, прозрачность и поддержка не спрятаны в футере.',
    metric: '0 рекламы',
  },
  {
    title: 'Урок как продуктовый сценарий',
    text: 'ИИ ведёт ученика: объясняет, проверяет, даёт следующий шаг и фиксирует освоение.',
    metric: '1-3 звезды',
  },
];

const useCases = [
  {
    title: 'Младшая школа',
    text: 'Мягкая подача, короткие задания, спокойная обратная связь.',
  },
  {
    title: 'Средняя школа',
    text: 'Карта темы, практика по слабым местам и привычка заниматься регулярно.',
  },
  {
    title: 'Подростки',
    text: 'Экзаменационный режим, объяснения без лишней игры и уважительный тон.',
  },
];

const plans = [
  {
    name: 'Знакомство',
    price: 'Бесплатно',
    text: '5 уроков, чтобы спокойно попробовать формат, диагностику и первые объяснения.',
  },
  {
    name: 'Практика',
    price: '1 500 ₽',
    text: '30 уроков для понятного результата: диагностика, объяснения и закрепление без подписки.',
  },
  {
    name: 'Без границ',
    price: '2 000 ₽',
    text: 'Для регулярных занятий в своём темпе: больше практики, прогресс и родительский обзор.',
    featured: true,
  },
];

const faqs = [
  {
    q: 'Можно ли ребёнку пользоваться сервисом самостоятельно?',
    a: 'Да, но родитель видит прогресс, настройки, темы занятий и рекомендации.',
  },
  {
    q: 'Чем это отличается от обычного чат-бота?',
    a: 'Omni Teacher ведёт урок как сценарий: диагностирует, объясняет, тренирует и фиксирует результат.',
  },
  {
    q: 'Подойдёт ли подросткам?',
    a: 'Да. Для 13-17 интерфейс спокойнее: меньше игры, больше ясных объяснений, тестов и результата.',
  },
];

const investorPoints = [
  {
    title: 'Адаптивные программы',
    text: 'ИИ-диагностика и динамическая персонализация делают обучение точнее с каждым занятием.',
  },
  {
    title: 'Мультимодальный урок',
    text: 'Текст, визуализация, голос и изображения работают в одном учебном сценарии.',
  },
  {
    title: 'Удержание через прогресс',
    text: 'Понятные циклы мотивации, оценка освоения и аналитика помогают доводить ученика до результата.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing-page landing-2026">
      <header className="landing-header landing-header-2026">
        <Link href="/" className="landing-brand" aria-label="Omni Teacher">
          <span className="landing-brand-mark" aria-hidden="true" />
          Omni Teacher
        </Link>
        <nav className="landing-nav" aria-label="Основная навигация">
          <a href="#product">Продукт</a>
          <a href="#segments">Возраст</a>
          <a href="#pricing">Цены</a>
          <a href="#investors">Для инвесторов</a>
        </nav>
        <div className="landing-header-actions">
          <Link href="/platform" className="landing-btn landing-btn--secondary">
            Вход
          </Link>
          <Link href="/platform?mode=registration" className="landing-btn landing-btn--primary">
            Регистрация
          </Link>
        </div>
      </header>

      <main>
        <section className="hero-2026">
          <div className="hero-copy-2026">
            <h1>ИИ-репетитор, который собирает учебный план под ребёнка</h1>
            <p>
              Omni Teacher диагностирует пробелы, объясняет тему в подходящем тоне,
              ведёт урок в чате или голосом и показывает родителям понятный прогресс.
            </p>
            <div className="landing-hero-actions">
              <a href="#pricing" className="landing-btn landing-btn--primary landing-btn--large">
                Попробовать
              </a>
            </div>
            <div className="proof-strip proof-strip-2026">
              {proofItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="hero-product-shell" aria-label="Превью продукта Omni Teacher">
            <div className="hero-product-topbar">
              <span />
              <strong>Урок: дроби и проценты</strong>
              <small>12 мин</small>
            </div>
            <div className="hero-product-grid">
              <aside className="hero-product-rail">
                {productFlow.map((step, index) => (
                  <span key={step} className={index === 1 ? 'is-active' : ''}>
                    {step}
                  </span>
                ))}
              </aside>
              <div className="hero-chat-demo">
                <article>
                  <strong>Omni Teacher</strong>
                  <p>Ты уверенно сокращаешь дроби. Сейчас потренируем переход к процентам.</p>
                </article>
                <article className="student">
                  <strong>Миша</strong>
                  <p>Я путаюсь, когда надо умножать на 100.</p>
                </article>
                <article>
                  <strong>Omni Teacher</strong>
                  <p>Смотри: 0,25 = 25%. Давай решим ещё два примера и закрепим.</p>
                </article>
              </div>
              <aside className="hero-insight-panel">
                <div>
                  <span>Освоение</span>
                  <strong>74%</strong>
                </div>
                <div className="hero-ring" aria-hidden="true" />
                <p>Следующий шаг: задачи на перевод десятичных дробей.</p>
              </aside>
            </div>
          </div>
        </section>

        <section className="tldr-strip" aria-label="Кратко о сервисе">
          {tldrCards.map((card) => (
            <article key={card.label} className={`tldr-card tldr-card--${card.tone}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>

        <section className="landing-section product-story-2026" id="product">
          <div className="landing-section-heading">
            <h2>Не чат-бот, а учебный сценарий с видимым результатом</h2>
            <p>
              Страница сразу показывает продукт: как ученик отвечает, как наставник ведёт урок
              и что получает родитель после занятия.
            </p>
          </div>
          <div className="bento-2026">
            <article className="bento-card bento-card--large">
              <div className="mini-dashboard">
                <div className="mini-dashboard-header">
                  <strong>План на неделю</strong>
                  <span>готов</span>
                </div>
                <div className="mini-timeline">
                  {productFlow.map((step, index) => (
                    <div key={step} className={index < 2 ? 'done' : ''}>
                      <span />
                      <p>{step}</p>
                    </div>
                  ))}
                </div>
              </div>
              <h3>Путь от диагностики до освоения</h3>
              <p>Родитель понимает, что произойдёт после регистрации, а ученик не остаётся один на один с пустым полем ввода.</p>
            </article>
            {valueProps.map((item) => (
              <article key={item.title} className="bento-card">
                <span className="bento-metric">{item.metric}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
            <article className="bento-card bento-card--accent">
              <h3>Сначала email и цель, потом детали</h3>
              <p>Форма не требует длинную анкету над первым экраном. Сервис доуточняет возраст, предмет и темп уже в процессе.</p>
              <Link href="/platform?mode=registration" className="landing-btn landing-btn--primary">
                Собрать мой план
              </Link>
            </article>
          </div>
        </section>

        <section className="landing-section segment-section-2026" id="segments">
          <div className="landing-section-heading">
            <h2>Три возрастных режима под разные учебные задачи</h2>
            <p>
              Визуальный язык остаётся доверительным и современным, а тон меняется:
              от мягкой поддержки до спокойного экзаменационного фокуса.
            </p>
          </div>
          <div className="segment-grid segment-grid-2026">
            {ageSegments.map((segment) => (
              <article key={segment.age} className="segment-card">
                <span>{segment.age}</span>
                <h3>{segment.title}</h3>
                <p>{segment.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section usecase-section">
          <div className="usecase-panel">
            <div>
              <h2>Выберите сценарий, а не “универсальный ИИ для всего”</h2>
              <p>Лендинг продаёт конкретный результат: помощь с темой, привычку заниматься или подготовку к проверочной.</p>
            </div>
            <div className="usecase-tabs">
              {useCases.map((item, index) => (
                <article key={item.title} className={index === 1 ? 'is-active' : ''}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section pricing-section-2026" id="pricing">
          <div className="landing-section-heading">
            <h2>Прозрачные цены без почасовой суеты с репетиторами</h2>
            <p>Начните бесплатно, затем выберите пакет уроков или подключите месяц регулярных занятий.</p>
          </div>
          <div className="pricing-grid">
            {plans.map((plan) => (
              <article key={plan.name} className={`pricing-card${plan.featured ? ' pricing-card--featured' : ''}`}>
                <h3>{plan.name}</h3>
                <strong>{plan.price}</strong>
                <p>{plan.text}</p>
                <Link href="/platform?mode=registration" className="landing-btn landing-btn--secondary">
                  Начать пробный период
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-investors investors-2026" id="investors">
          <div className="landing-investors-copy">
            <h2>Для инвесторов</h2>
            <h3>ИИ-ориентированная образовательная платформа</h3>
            <p>
              Omni Teacher - масштабируемая платформа для семей на стыке ИИ и образования.
              Мы создаём персонализированное обучение для миллионов детей.
            </p>
            <Link href="/platform?mode=registration" className="landing-btn landing-btn--secondary">
              Открыть материалы
            </Link>
          </div>
          <div className="landing-investor-points">
            {investorPoints.map((point) => (
              <article key={point.title}>
                <h4>{point.title}</h4>
                <p>{point.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section faq-section-2026">
          <div className="landing-section-heading">
            <h2>Коротко перед стартом</h2>
            <p>Закрываем главные сомнения родителей до клика по регистрации.</p>
          </div>
          <div className="faq-grid">
            {faqs.map((faq) => (
              <article key={faq.q}>
                <h3>{faq.q}</h3>
                <p>{faq.a}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-final final-2026">
          <div>
            <h2>Получите первый учебный план ребёнка сегодня</h2>
            <p>Выберите возраст, цель и начните с диагностического урока перед подпиской.</p>
          </div>
          <div className="landing-final-actions">
            <Link href="/platform?mode=registration" className="landing-btn landing-btn--primary landing-btn--large">
              Получить план обучения
            </Link>
            <Link href="/platform" className="landing-btn landing-btn--secondary landing-btn--large">
              Войти
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-links">
          <Link href="/">Omni Teacher</Link>
          <span>Конфиденциальность</span>
          <span>Условия</span>
          <span>Доступность</span>
          <span>Поддержка</span>
          <span>Материалы для родителей</span>
        </div>
        <p className="landing-footer-requisites">
          ИП Токмаков Юрий Константинович · ОГРНИП 322265100121349 · ИНН 263408820400
        </p>
      </footer>
    </div>
  );
}
