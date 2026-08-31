/* ============================================================================
   Contact form.

   Submits over fetch with the CSRF token in a header, mirrors the server's
   validation for instant feedback, and degrades to a normal form POST if
   JavaScript is unavailable (the form keeps its method and action).
   ========================================================================== */

const form = document.getElementById('contact-form');

if (form) {
  const submitBtn = document.getElementById('contact-submit');
  const statusEl = document.getElementById('form-status');
  const statusText = document.getElementById('form-status-text');
  const statusIcon = document.getElementById('form-status-icon');
  const csrfInput = document.getElementById('csrf-input');

  const csrfHeader =
    document.querySelector('meta[name="csrf-header"]')?.content || 'x-csrf-token';

  /* ------------------------------------------------------------- helpers -- */
  const fieldOf = (name) => form.querySelector(`[name="${name}"]`)?.closest('.field');

  function setError(name, message) {
    const field = fieldOf(name);
    if (!field) return;
    const slot = field.querySelector(`[data-error-for="${name}"]`);
    if (message) {
      field.classList.add('has-error');
      if (slot) slot.textContent = message;
      field.querySelector('input, textarea')?.setAttribute('aria-invalid', 'true');
    } else {
      field.classList.remove('has-error');
      if (slot) slot.textContent = '';
      field.querySelector('input, textarea')?.removeAttribute('aria-invalid');
    }
  }

  function clearErrors() {
    ['name', 'email', 'subject', 'message'].forEach((n) => setError(n, ''));
  }

  function showStatus(kind, message) {
    if (!statusEl || !statusText) return;
    statusEl.classList.remove('form-status--ok', 'form-status--error');
    statusEl.classList.add('is-shown', kind === 'ok' ? 'form-status--ok' : 'form-status--error');
    statusText.textContent = message;
    if (statusIcon) {
      statusIcon.innerHTML = `<use href="#i-${kind === 'ok' ? 'check' : 'alert'}"></use>`;
    }
  }

  function hideStatus() {
    statusEl?.classList.remove('is-shown');
  }

  /* ---------------------------------------------------- live character count */
  form.querySelectorAll('[data-counter-for]').forEach((counter) => {
    const input = form.querySelector(`[name="${counter.dataset.counterFor}"]`);
    if (!input) return;
    const max = Number(input.getAttribute('maxlength')) || 0;
    const update = () => {
      counter.textContent = `${input.value.length} / ${max}`;
      counter.classList.toggle('is-near', max > 0 && input.value.length > max * 0.9);
    };
    input.addEventListener('input', update);
    update();
  });

  /* ------------------------------------------ clear an error as it's fixed -- */
  ['name', 'email', 'subject', 'message'].forEach((name) => {
    form.querySelector(`[name="${name}"]`)?.addEventListener('input', () => {
      if (fieldOf(name)?.classList.contains('has-error')) setError(name, '');
    });
  });

  /* -------------------------------------------------- client-side checking -- */
  const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

  function validate(values) {
    const errors = {};
    if (values.name.trim().length < 2) errors.name = 'Please tell me your name.';
    if (!EMAIL_RE.test(values.email.trim())) errors.email = "That email doesn't look right.";
    if (values.message.trim().length < 12) errors.message = 'A little more detail, please.';
    return errors;
  }

  /* ------------------------------------------------------------- submit --- */
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideStatus();
    clearErrors();

    const data = new FormData(form);
    const values = {
      name: String(data.get('name') || ''),
      email: String(data.get('email') || ''),
      subject: String(data.get('subject') || ''),
      message: String(data.get('message') || ''),
      website: String(data.get('website') || ''),
      renderedAt: String(data.get('renderedAt') || ''),
      _csrf: String(data.get('_csrf') || ''),
    };

    const errors = validate(values);
    if (Object.keys(errors).length) {
      Object.entries(errors).forEach(([k, v]) => setError(k, v));
      form.querySelector('.has-error input, .has-error textarea')?.focus();
      showStatus('error', 'Some fields need another look.');
      return;
    }

    submitBtn?.classList.add('is-loading');
    submitBtn?.setAttribute('disabled', 'true');

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          [csrfHeader]: values._csrf,
        },
        body: JSON.stringify(values),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.ok) {
        showStatus('ok', result.message || 'Message sent.');
        form.reset();
        form.querySelectorAll('[data-counter-for]').forEach((c) => {
          const input = form.querySelector(`[name="${c.dataset.counterFor}"]`);
          const max = Number(input?.getAttribute('maxlength')) || 0;
          c.textContent = `0 / ${max}`;
          c.classList.remove('is-near');
        });

        // The server rotates the token after a successful send, so a replay of
        // the same token can't go through. Adopt the new one.
        if (result.csrfToken && csrfInput instanceof HTMLInputElement) {
          csrfInput.value = result.csrfToken;
          const meta = document.querySelector('meta[name="csrf-token"]');
          if (meta) meta.setAttribute('content', result.csrfToken);
        }
        const stamp = form.querySelector('[name="renderedAt"]');
        if (stamp instanceof HTMLInputElement) stamp.value = String(Date.now());
        return;
      }

      if (result.errors) {
        Object.entries(result.errors).forEach(([k, v]) => setError(k, String(v)));
      }
      showStatus('error', result.message || 'That did not go through. Please try again.');
    } catch {
      showStatus(
        'error',
        'Could not reach the server. Check your connection, or email me directly at khanswaccho@gmail.com.'
      );
    } finally {
      submitBtn?.classList.remove('is-loading');
      submitBtn?.removeAttribute('disabled');
    }
  });
}
