const DEFAULT_API_BASE = 'http://localhost:8000';
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? DEFAULT_API_BASE;

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Root element #app not found');
}

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);

const state = {
  apiStatus: 'unknown' as 'unknown' | 'healthy' | 'unreachable',
  lastChecked: null as Date | null,
  timeline: [] as Array<{ title: string; detail: string; when: Date }>,
};

const createElement = <T extends keyof HTMLElementTagNameMap>(
  tag: T,
  options: { className?: string; text?: string } = {},
): HTMLElementTagNameMap[T] => {
  const node = document.createElement(tag);
  if (options.className) {
    node.className = options.className;
  }
  if (options.text) {
    node.textContent = options.text;
  }
  return node;
};

const render = () => {
  root.innerHTML = '';
  const shell = createElement('div', { className: 'app-shell' });

  const header = createElement('section', { className: 'header' });
  header.append(
    createElement('h1', { text: 'Omni Teacher Control Room' }),
    createElement('p', {
      text: 'Monitor core services, inspect learner activity, and trigger manual workflows.',
    }),
  );

  const cardGrid = createElement('section', { className: 'card-grid' });
  const statusCard = createElement('article', { className: 'card' });
  statusCard.append(createElement('h2', { text: 'Backend health' }));

  const status = createElement('p');
  if (state.apiStatus === 'unknown') {
    status.textContent = 'Not checked yet';
  } else if (state.apiStatus === 'healthy') {
    status.textContent = 'Operational';
    status.style.color = '#15803d';
  } else {
    status.textContent = 'Unreachable';
    status.style.color = '#dc2626';
  }
  statusCard.append(status);

  const statusMeta = createElement('p');
  statusMeta.style.margin = '0';
  statusMeta.style.color = '#475569';
  statusMeta.textContent = `API base: ${API_BASE}`;
  statusCard.append(statusMeta);

  if (state.lastChecked) {
    statusCard.append(
      createElement('p', {
        text: `Last checked ${formatDateTime(state.lastChecked)}`,
      }),
    );
  }

  const checkButton = createElement('button', { className: 'primary', text: 'Run health check' });
  checkButton.addEventListener('click', async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      await response.json();
      state.apiStatus = 'healthy';
      state.timeline.unshift({
        title: 'Health check succeeded',
        detail: 'The backend responded successfully to /health.',
        when: new Date(),
      });
    } catch (error) {
      console.error('Health check failed', error);
      state.apiStatus = 'unreachable';
      state.timeline.unshift({
        title: 'Health check failed',
        detail: 'Unable to reach the backend service. Verify docker-compose is running.',
        when: new Date(),
      });
    } finally {
      state.lastChecked = new Date();
      render();
    }
  });
  statusCard.append(checkButton);

  cardGrid.append(statusCard);

  const feedCard = createElement('article', { className: 'card' });
  feedCard.append(createElement('h2', { text: 'Operations feed' }));
  const feed = createElement('div', { className: 'feed' });

  if (!state.timeline.length) {
    const empty = createElement('p', {
      text: 'No manual actions yet. Run a health check or trigger a workflow.',
    });
    empty.style.margin = '0';
    empty.style.color = '#475569';
    feed.append(empty);
  } else {
    state.timeline.slice(0, 10).forEach((entry) => {
      const item = createElement('article', { className: 'feed-entry' });
      const time = createElement('time', { text: formatDateTime(entry.when) });
      const title = createElement('strong', { text: entry.title });
      const detail = createElement('span', { text: entry.detail });
      item.append(time, title, detail);
      feed.append(item);
    });
  }

  feedCard.append(feed);
  cardGrid.append(feedCard);

  shell.append(header, cardGrid);
  root.append(shell);
};

render();
