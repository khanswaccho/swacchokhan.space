/* ============================================================================
   Site assistant — client.

   Posts to /api/chat with the CSRF token. Every answer comes from the server,
   which composes it from data/profile.json; nothing is authored here.
   ========================================================================== */

const root = document.getElementById('chat');

if (root) {
  const launcher = document.getElementById('chat-launcher');
  const panel = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('chat-close');
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const sendBtn = form.querySelector('.chat__send');
  const suggestionsEl = document.getElementById('chat-suggestions');

  const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content || '';
  const csrfHeader = document.querySelector('meta[name="csrf-header"]')?.content || 'x-csrf-token';

  let opened = false;
  let busy = false;

  /* ------------------------------------------------------------ rendering -- */
  // Wait a frame: a message with link chips hasn't been laid out yet when it is
  // appended, so scrolling immediately lands short of the bottom.
  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  };

  function addMessage(text, who, links = []) {
    const el = document.createElement('div');
    el.className = `msg msg--${who}`;
    el.textContent = text;

    if (links.length) {
      const wrap = document.createElement('div');
      wrap.className = 'msg__links';
      links.forEach((link) => {
        const a = document.createElement('a');
        a.className = 'msg__link';
        a.href = link.href;
        a.textContent = link.label;
        a.dataset.cursor = 'hover';
        // Only send people off-site in a new tab; internal routes navigate here.
        if (/^https?:\/\//i.test(link.href)) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        wrap.appendChild(a);
      });
      el.appendChild(wrap);
    }

    log.appendChild(el);
    scrollToEnd();
    return el;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'msg msg--bot msg--typing';
    el.innerHTML = '<i></i><i></i><i></i>';
    el.setAttribute('aria-label', 'Assistant is typing');
    log.appendChild(el);
    scrollToEnd();
    return el;
  }

  function renderSuggestions(list = []) {
    suggestionsEl.textContent = '';
    list.slice(0, 4).forEach((text) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat__chip';
      btn.textContent = text;
      btn.dataset.cursor = 'hover';
      btn.addEventListener('click', () => send(text));
      suggestionsEl.appendChild(btn);
    });
  }

  /* --------------------------------------------------------------- sending -- */
  async function send(message) {
    const text = String(message || '').trim();
    if (!text || busy) return;

    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    addMessage(text, 'user');
    renderSuggestions([]);

    const typing = showTyping();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          [csrfHeader]: csrfToken(),
        },
        body: JSON.stringify({ message: text }),
      });

      const data = await response.json().catch(() => ({}));

      // A short beat so answers don't snap back faster than they can be read.
      await new Promise((r) => setTimeout(r, 260));
      typing.remove();

      if (response.ok && data.ok) {
        addMessage(data.reply, 'bot', data.links || []);
        renderSuggestions(data.suggestions || []);
      } else {
        addMessage(
          data.message || 'Something went wrong on my side. You can always email khanswaccho@gmail.com.',
          'bot',
          [{ label: 'khanswaccho@gmail.com', href: 'mailto:khanswaccho@gmail.com' }]
        );
      }
    } catch {
      typing.remove();
      addMessage("I couldn't reach the server. Try again, or email khanswaccho@gmail.com.", 'bot', [
        { label: 'khanswaccho@gmail.com', href: 'mailto:khanswaccho@gmail.com' },
      ]);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  /* --------------------------------------------------------------- opening -- */
  function open() {
    root.classList.add('is-open', 'has-been-opened');
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    launcher.setAttribute('aria-label', 'Close the site assistant');

    if (!opened) {
      opened = true;
      // Greet from the server so the copy stays in profile.json like everything else.
      fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          [csrfHeader]: csrfToken(),
        },
        body: JSON.stringify({ message: 'hello' }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            addMessage(data.reply, 'bot', data.links || []);
            renderSuggestions(data.suggestions || []);
          }
        })
        .catch(() => {
          addMessage('Hi — ask me how to reach Swaccho, or what he works on.', 'bot');
        });
    }

    window.setTimeout(() => input.focus(), 260);
  }

  function close() {
    root.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Open the site assistant');
    // Keep the transcript, just hide it once the collapse has played.
    window.setTimeout(() => {
      if (!root.classList.contains('is-open')) panel.hidden = true;
    }, 320);
  }

  launcher.addEventListener('click', () => {
    if (root.classList.contains('is-open')) close();
    else open();
  });

  closeBtn.addEventListener('click', close);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('is-open')) {
      close();
      launcher.focus();
    }
  });

  // Clicking outside closes it, but not while the pointer is inside the panel.
  document.addEventListener('pointerdown', (e) => {
    if (!root.classList.contains('is-open')) return;
    if (e.target instanceof Element && !root.contains(e.target)) close();
  });
}
