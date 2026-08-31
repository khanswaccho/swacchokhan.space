/**
 * The site assistant.
 *
 * Deliberately NOT a language model. Every answer is composed from
 * data/profile.json at request time, so the bot cannot invent a qualification,
 * a client or a contact detail — if it isn't in the profile, it can't be said.
 * Matching is keyword/phrase scoring over a small intent table.
 *
 * It runs server-side so the intent table can grow (or be swapped for a real
 * model later) without shipping anything extra to the browser.
 */
import profile from './profile.js';

const MAX_INPUT = 500;

/** Lowercase, strip punctuation, collapse whitespace. */
function normalise(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@.+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Intent table. `phrases` are multi-word and score higher than single
 * `keywords`, so "how do I contact him" beats a stray "how".
 */
function intents() {
  const p = profile;
  const id = p.identity;
  const links = p.links;

  const mailLink = { label: id.email, href: `mailto:${id.email}` };
  const contactLink = { label: 'Contact page', href: '/contact' };

  return [
    {
      id: 'greeting',
      phrases: ['good morning', 'good evening', 'good afternoon', 'assalamu alaikum'],
      keywords: ['hi', 'hello', 'hey', 'yo', 'salam', 'hola', 'greetings'],
      answer: () =>
        `Hello. I'm the assistant for ${id.name}'s site — I can tell you how to reach him, what he works on, or where to find his work.`,
      suggestions: ['How do I contact him?', 'What does he do?', 'Is he available for work?'],
    },

    {
      id: 'contact',
      phrases: [
        'contact him', 'contact swaccho', 'get in touch', 'reach him', 'reach out',
        'email address', 'his email', 'e mail', 'how do i contact', 'how can i contact',
        'talk to him', 'message him', 'hire him',
      ],
      keywords: ['contact', 'email', 'mail', 'reach', 'message', 'inbox', 'touch', 'phone', 'call', 'whatsapp'],
      answer: () =>
        `The quickest way is email: ${id.email}. There's also a contact form on this site that goes straight to that inbox — he usually replies within a day or two.`,
      links: () => [mailLink, contactLink, { label: 'LinkedIn', href: links.linkedin }],
      suggestions: ['Is he available for work?', 'Where is he based?', 'What does he charge?'],
    },

    {
      id: 'location',
      phrases: [
        'where is he', 'where does he live', 'where are you based', 'where is he based',
        'what country', 'which city', 'time zone', 'does he work remotely',
      ],
      keywords: ['where', 'based', 'location', 'live', 'country', 'city', 'bangladesh', 'dhaka', 'sirajganj', 'remote', 'timezone'],
      answer: () =>
        `He's based in ${id.location}. Websthan works with clients across Bangladesh and remotely worldwide, so a project doesn't need to be local.`,
      links: () => [contactLink],
      suggestions: ['How do I contact him?', 'What is Websthan?'],
    },

    {
      id: 'availability',
      phrases: [
        'available for work', 'is he available', 'looking for work', 'open to work',
        'can i hire', 'hire him', 'work with him', 'freelance work', 'take on projects',
        'is he free', 'accepting clients', 'how much does he charge', 'what does he charge',
      ],
      keywords: ['available', 'availability', 'hire', 'hiring', 'freelance', 'internship', 'job', 'opportunity', 'rate', 'price', 'cost', 'quote', 'budget'],
      answer: () =>
        `Yes — ${id.availability.toLowerCase()}. He's most interested in anything with AI, machine learning or the web in it. Pricing depends entirely on scope, so the honest answer is to send him the details and ask.`,
      links: () => [contactLink, mailLink],
      suggestions: ['What does he do?', 'What is Websthan?', 'How do I contact him?'],
    },

    {
      id: 'about',
      phrases: [
        'who is he', 'who is swaccho', 'tell me about him', 'about him', 'about swaccho',
        'what does he do', 'what is he', 'his background', 'introduce him', 'who are you',
      ],
      keywords: ['who', 'about', 'bio', 'background', 'introduction', 'yourself', 'himself'],
      answer: () => `${id.shortBio} His main focus right now is AI and machine learning.`,
      links: () => [{ label: 'His journey', href: '/journey' }, { label: 'Portfolio', href: '/portfolio' }],
      suggestions: ['What does he know about AI?', 'What is Websthan?', 'Where did he study?'],
    },

    {
      id: 'ai',
      phrases: [
        'machine learning', 'artificial intelligence', 'deep learning', 'neural network',
        'data science', 'what does he know about ai', 'ai skills', 'ml skills', 'large language model',
      ],
      keywords: ['ai', 'ml', 'llm', 'neural', 'model', 'tensorflow', 'pytorch', 'python'],
      // Composed here rather than reusing focus[].summary, which is written in
      // his own first-person voice and would clash with the assistant's.
      answer: () => {
        const ml = p.skills.find((g) => g.group.startsWith('AI'));
        return (
          `AI and machine learning are his main focus. He's working through it from first principles — ` +
          `the linear algebra and statistics underneath, Python and the modern ML stack on top — rather than just calling libraries. ` +
          `Specifically: ${ml.items.map((i) => i.name).join(', ')}. ` +
          `He's upfront that this is in progress: the site marks these "building", not "core".`
        );
      },
      links: () => [{ label: 'GitHub', href: links.github }, { label: 'Home — focus areas', href: '/#focus' }],
      suggestions: ['What else does he build?', 'What is Websthan?', 'Where did he study?'],
    },

    {
      id: 'websthan',
      phrases: [
        'what is websthan', 'about websthan', 'his company', 'his business', 'his studio',
        'his agency', 'web design service', 'digital marketing service', 'build me a website',
        'need a website', 'want a website',
      ],
      keywords: ['websthan', 'studio', 'agency', 'company', 'business', 'marketing', 'seo', 'design'],
      answer: () =>
        `Websthan is the web design and digital marketing agency he founded, based in ${id.location}. ` +
        `He leads the tech team, sets the business strategy and handles clients directly — and still builds on the front end. ` +
        `It's at ${links.websthan}. If you need a site built or rescued, that's the door to knock on.`,
      links: () => [{ label: 'websthan.online', href: links.websthan }, contactLink],
      suggestions: ['How do I contact him?', 'Is he available for work?', 'What does he do?'],
    },

    {
      id: 'leadership',
      phrases: [
        'does he manage', 'does he lead', 'his team', 'team management', 'how big is the team',
        'is he a manager', 'business strategy', 'does he handle clients', 'client management',
        'tech lead', 'leadership experience',
      ],
      keywords: ['team', 'manage', 'management', 'lead', 'leader', 'leadership', 'strategy', 'clients', 'delegate', 'hiring'],
      answer: () =>
        `At Websthan he runs the agency rather than just building for it — he leads the tech team, sets business strategy, ` +
        `and is the person clients deal with directly. Before that he was vice-president of his school's basketball club and ` +
        `sat on the Student Representative Council at SEGi, so the leadership habit predates the company.`,
      links: () => [{ label: 'websthan.online', href: links.websthan }, { label: 'Full timeline', href: '/journey#timeline' }],
      suggestions: ['What is Websthan?', 'Is he available for work?', 'What are his skills?'],
    },

    {
      id: 'skills',
      phrases: [
        'what are his skills', 'his skills', 'tech stack', 'what technologies', 'what languages does he code',
        'programming languages', 'what can he do', 'what tools',
      ],
      keywords: ['skill', 'skills', 'stack', 'technology', 'technologies', 'tools', 'programming', 'javascript', 'node', 'html', 'css'],
      answer: () => {
        const groups = p.skills
          .map((g) => `${g.group}: ${g.items.map((i) => i.name).join(', ')}`)
          .join('. ');
        return `${groups}. Each one is labelled honestly on the site — "core" means daily use, "building" means actively learning.`;
      },
      links: () => [{ label: 'Skills', href: '/#skills' }],
      suggestions: ['What does he know about AI?', 'Show me his projects', 'Where did he study?'],
    },

    {
      id: 'education',
      phrases: [
        'where did he study', 'his education', 'what did he study', 'his degree', 'which university',
        'his school', 'his college', 'academic background', 'his results', 'his cgpa', 'o level',
      ],
      keywords: ['education', 'study', 'studying', 'student', 'university', 'degree', 'school', 'college', 'academic', 'ucsi', 'segi', 'cgpa', 'ielts', 'graduate'],
      answer: () => {
        const edu = p.timeline.filter((t) => t.kind === 'education');
        const lines = edu.map((e) => `${e.title} at ${e.org} (${e.period})`).join('; ');
        // Pull just the band out of "English (IELTS 7.5)".
        const band = (id.languages.find((l) => l.includes('IELTS')) || '').match(/IELTS\s*([\d.]+)/);
        return band ? `${lines}. He also has an IELTS band of ${band[1]}.` : `${lines}.`;
      },
      links: () => [{ label: 'Full timeline', href: '/journey#timeline' }],
      suggestions: ['What does he do?', 'What work has he done?'],
    },

    {
      id: 'experience',
      phrases: [
        'his experience', 'work experience', 'his jobs', 'where has he worked', 'his career',
        'does he teach', 'ielts teaching', 'his teaching',
      ],
      keywords: ['experience', 'work', 'worked', 'job', 'jobs', 'career', 'teaching', 'teacher', 'instructor', 'ielts', 'mentor'],
      answer: () => {
        const work = p.timeline.filter((t) => t.kind === 'work' && !t.quiet);
        const lines = work.map((w) => `${w.title} at ${w.org} (${w.period})`).join('; ');
        return `${lines}. The full run, including volunteering, is on the journey page.`;
      },
      links: () => [{ label: 'Full timeline', href: '/journey#timeline' }],
      suggestions: ['Where did he study?', 'What is Websthan?'],
    },

    {
      id: 'projects',
      phrases: [
        'his projects', 'show me his work', 'his portfolio', 'his github', 'his code',
        'what has he built', 'what has he made', 'his repos', 'source code',
      ],
      keywords: ['project', 'projects', 'portfolio', 'github', 'repo', 'repos', 'repository', 'code', 'built', 'work'],
      answer: () =>
        `His public repositories are pulled live onto the portfolio page, straight from github.com/${p.githubUser}. A lot of his build hours also go into Websthan client sites, which live on their own domains rather than in a repo.`,
      links: () => [{ label: 'Portfolio', href: '/portfolio' }, { label: 'GitHub', href: links.github }],
      suggestions: ['What is Websthan?', 'Is he available for work?'],
    },

    {
      id: 'writing',
      phrases: ['his writing', 'his articles', 'his blog', 'does he write', 'medium profile', 'his essays'],
      keywords: ['writing', 'write', 'writer', 'article', 'articles', 'blog', 'medium', 'essay', 'essays'],
      answer: () =>
        `He's new to writing publicly — a few articles on Medium so far, on technology and learning. ` +
        `He'd rather call himself a beginner at it than oversell. They're at ${links.medium}.`,
      links: () => [{ label: 'Medium', href: links.medium }],
      suggestions: ['What are his hobbies?', 'What does he do?'],
    },

    {
      id: 'video',
      phrases: [
        'video editing', 'his youtube', 'youtube channel', 'does he edit videos',
        'video portfolio', 'his videos', 'video work',
      ],
      keywords: ['video', 'editing', 'editor', 'youtube', 'channel', 'footage', 'reel'],
      answer: () =>
        `That's a former life. He spent years freelance video editing and running a YouTube channel before moving to code full-time — he doesn't take video work now, but both are still up as an archive.`,
      links: () => [
        { label: 'Video editing portfolio', href: links.videoPortfolio },
        { label: 'YouTube channel', href: links.youtube },
      ],
      suggestions: ['What does he do now?', 'What are his hobbies?'],
    },

    {
      id: 'hobbies',
      phrases: ['his hobbies', 'free time', 'what does he do for fun', 'his interests', 'outside work'],
      keywords: ['hobby', 'hobbies', 'fun', 'interests', 'chess', 'reading', 'books', 'photography', 'sports', 'basketball'],
      answer: () => `${p.hobbies.map((h) => h.name).join(', ')}. Most of them fed into the work eventually.`,
      links: () => [{ label: 'Hobbies', href: '/#hobbies' }],
      suggestions: ['Does he write?', 'What does he do?'],
    },

    {
      id: 'languages',
      phrases: ['what languages does he speak', 'does he speak english', 'does he speak bangla', 'his english'],
      keywords: ['bengali', 'bangla', 'english', 'hindi', 'speak', 'fluent', 'multilingual'],
      answer: () => `He speaks ${id.languages.join(', ')}.`,
      suggestions: ['Where is he based?', 'How do I contact him?'],
    },

    {
      id: 'security',
      phrases: ['is this site secure', 'his security', 'does he know security', 'cyber security'],
      keywords: ['security', 'cybersecurity', 'secure', 'csrf', 'privacy', 'safe', 'hacking', 'vulnerability'],
      answer: () =>
        `Cybersecurity is a side interest he takes seriously, and this site is where he applies it — signed CSRF tokens, a strict Content-Security-Policy, rate limiting and validated input on every form.`,
      suggestions: ['How was this site built?', 'What are his skills?'],
    },

    {
      id: 'site',
      phrases: [
        'how was this site built', 'how did he build this', 'what is this site built with',
        'this website tech', 'is this ai', 'are you a real person', 'are you a bot', 'are you human',
      ],
      keywords: ['built', 'build', 'made', 'bot', 'robot', 'chatbot', 'assistant'],
      answer: () =>
        `I'm a small scripted assistant, not an AI — I answer from a fixed profile of ${id.name}'s details, so I can't make anything up. The site itself is hand-built: Node and Express on the server, Three.js for the 3D book and the hero, no page builder.`,
      suggestions: ['How do I contact him?', 'What does he do?'],
    },

    {
      id: 'thanks',
      phrases: ['thank you', 'thanks a lot', 'much appreciated', 'that helps'],
      keywords: ['thanks', 'thank', 'thx', 'cheers', 'appreciate'],
      answer: () => `Happy to help. If you want to take it further, the contact form is the fastest route to him.`,
      links: () => [contactLink],
      suggestions: ['How do I contact him?'],
    },

    {
      id: 'bye',
      phrases: ['see you', 'good bye', 'talk later'],
      keywords: ['bye', 'goodbye', 'later', 'cya'],
      answer: () => `Take care. He's at ${id.email} whenever you need him.`,
      suggestions: [],
    },
  ];
}

function scoreIntent(intent, text, tokens) {
  let score = 0;

  for (const phrase of intent.phrases || []) {
    if (text.includes(phrase)) score += 4;
  }

  const seen = new Set();
  for (const keyword of intent.keywords || []) {
    if (seen.has(keyword)) continue;
    if (tokens.has(keyword)) {
      seen.add(keyword);
      score += 1;
    }
  }

  return score;
}

/**
 * @param {string} message
 * @returns {{ reply: string, intent: string, links: Array, suggestions: string[] }}
 */
export function ask(message) {
  const text = normalise(String(message).slice(0, MAX_INPUT));
  const id = profile.identity;

  if (!text) {
    return {
      intent: 'empty',
      reply: `Ask me something — how to reach ${id.name}, what he works on, or where he's based.`,
      links: [],
      suggestions: profile.assistant.suggestions,
    };
  }

  const tokens = new Set(text.split(' '));
  const table = intents();

  let best = null;
  let bestScore = 0;
  for (const intent of table) {
    const score = scoreIntent(intent, text, tokens);
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }

  if (!best || bestScore < 1) {
    return {
      intent: 'fallback',
      reply:
        `I don't have an answer for that one — I only know what's on this site. ` +
        `Try asking about how to contact him, what he works on, Websthan, his studies, or his projects. ` +
        `For anything else, email him directly at ${id.email}.`,
      links: [
        { label: id.email, href: `mailto:${id.email}` },
        { label: 'Contact page', href: '/contact' },
      ],
      suggestions: profile.assistant.suggestions,
    };
  }

  return {
    intent: best.id,
    reply: best.answer(),
    links: best.links ? best.links() : [],
    suggestions: best.suggestions || profile.assistant.suggestions,
  };
}

export function greeting() {
  return {
    reply: profile.assistant.greeting,
    suggestions: profile.assistant.suggestions,
  };
}
