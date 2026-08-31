/**
 * GitHub repository feed.
 *
 * Fetched server-side so that (a) an optional token never reaches the browser,
 * (b) GitHub's unauthenticated rate limit is spent once per cache window rather
 * than once per visitor, and (c) the response is normalised and length-capped
 * before it is handed to the client.
 */

const CACHE_TTL_MS = Number(process.env.GITHUB_CACHE_MINUTES || 30) * 60 * 1000;

const cache = {
  data: null,
  fetchedAt: 0,
  inflight: null,
};

const LANGUAGE_COLORS = {
  Python: '#3572A5',
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  C: '#555555',
  'C++': '#f34b7d',
  Java: '#b07219',
  Jupyter: '#DA5B0B',
  'Jupyter Notebook': '#DA5B0B',
  Shell: '#89e051',
  PHP: '#4F5D95',
  Go: '#00ADD8',
  Rust: '#dea584',
  Dart: '#00B4AB',
  Ruby: '#701516',
  Vue: '#41b883',
  SCSS: '#c6538c',
};

/** Repos that should always float to the top of the grid, in this order. */
const PINNED = (process.env.PINNED_REPOS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const AI_HINTS = /\b(ai|ml|machine[- ]?learning|deep[- ]?learning|neural|tensor|torch|sklearn|scikit|llm|gpt|nlp|data[- ]?science|model|agent)\b/i;
const WEB_HINTS = /\b(web|site|website|portfolio|landing|frontend|front[- ]?end|react|next|css|html|blog|ecommerce|shop)\b/i;
const SEC_HINTS = /\b(security|sec|crypto|cipher|hash|pentest|scanner|auth|vuln)\b/i;

function classify(repo) {
  const haystack = `${repo.name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`;
  if (AI_HINTS.test(haystack)) return 'ai';
  if (SEC_HINTS.test(haystack)) return 'security';
  if (WEB_HINTS.test(haystack) || ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'Vue'].includes(repo.language)) {
    return 'web';
  }
  return 'other';
}

function normalise(repo) {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ? String(repo.description).slice(0, 240) : null,
    url: repo.html_url,
    homepage: repo.homepage && /^https?:\/\//i.test(repo.homepage) ? repo.homepage : null,
    language: repo.language,
    languageColor: LANGUAGE_COLORS[repo.language] || '#8b95a5',
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 6) : [],
    updatedAt: repo.pushed_at || repo.updated_at,
    isFork: Boolean(repo.fork),
    isArchived: Boolean(repo.archived),
    category: classify(repo),
  };
}

function rank(a, b) {
  const ai = PINNED.indexOf(a.name.toLowerCase());
  const bi = PINNED.indexOf(b.name.toLowerCase());
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }
  if (b.stars !== a.stars) return b.stars - a.stars;
  return new Date(b.updatedAt) - new Date(a.updatedAt);
}

async function fetchFromGitHub(username) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'swacchokhan-portfolio',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const [reposRes, userRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`, {
        headers,
        signal: controller.signal,
      }),
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers,
        signal: controller.signal,
      }),
    ]);

    if (!reposRes.ok) {
      throw new Error(`GitHub responded ${reposRes.status}`);
    }

    const raw = await reposRes.json();
    const user = userRes.ok ? await userRes.json() : null;

    const repos = (Array.isArray(raw) ? raw : [])
      .filter((r) => !r.private)
      .map(normalise)
      .sort(rank);

    return {
      repos,
      profile: user
        ? {
            login: user.login,
            name: user.name,
            avatar: user.avatar_url,
            bio: user.bio,
            publicRepos: user.public_repos,
            followers: user.followers,
            url: user.html_url,
          }
        : null,
      stats: {
        total: repos.length,
        stars: repos.reduce((sum, r) => sum + r.stars, 0),
        languages: [...new Set(repos.map((r) => r.language).filter(Boolean))],
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the cached repo payload, refreshing it at most once per TTL.
 * Concurrent callers share a single in-flight request.
 * On failure, a stale cache is preferred over an error.
 */
export async function getRepos(username) {
  const fresh = cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
  if (fresh) return { ...cache.data, cached: true };
  if (cache.inflight) return cache.inflight;

  cache.inflight = (async () => {
    try {
      const data = await fetchFromGitHub(username);
      cache.data = data;
      cache.fetchedAt = Date.now();
      return { ...data, cached: false };
    } catch (err) {
      console.error('[github] fetch failed:', err.message);
      if (cache.data) return { ...cache.data, cached: true, stale: true };
      return {
        repos: [],
        profile: null,
        stats: { total: 0, stars: 0, languages: [] },
        error: 'unavailable',
      };
    } finally {
      cache.inflight = null;
    }
  })();

  return cache.inflight;
}
