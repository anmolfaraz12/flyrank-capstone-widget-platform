(function () {
  // Find our own <script> tag to read the ?id= query param
  const scripts = document.getElementsByTagName('script');
  const thisScript = scripts[scripts.length - 1];
  const scriptUrl = new URL(thisScript.src);
  const widgetId = scriptUrl.searchParams.get('id');
  const apiOrigin = scriptUrl.origin; // same host the script was loaded from

  if (!widgetId) {
    console.error('[widget] missing ?id= on the script tag');
    return;
  }

  // Inject scoped styles once, even if multiple widgets are on the same page
  if (!document.getElementById('flyrank-widget-styles')) {
    const style = document.createElement('style');
    style.id = 'flyrank-widget-styles';
    style.textContent = `
      .frw-container {
        max-width: 360px;
        border: none;
        border-radius: 16px;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: linear-gradient(135deg, #ff9a8b 0%, #ff6a88 55%, #ff99ac 100%);
        box-shadow: 0 8px 24px rgba(255, 106, 136, 0.35);
        color: #fff;
      }
      .frw-title {
        margin: 0 0 6px 0;
        font-size: 20px;
        font-weight: 700;
      }
      .frw-desc {
        margin: 0 0 14px 0;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
      }
      .frw-input {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        margin-bottom: 10px;
        border: none;
        border-radius: 999px;
        font-size: 14px;
        outline: none;
        transition: box-shadow 0.15s ease;
      }
      .frw-input:focus {
        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.6);
      }
      .frw-button {
        width: 100%;
        padding: 12px;
        cursor: pointer;
        border: none;
        border-radius: 999px;
        background: #fff;
        color: #ff6a88;
        font-weight: 700;
        font-size: 14px;
        transition: transform 0.1s ease, box-shadow 0.15s ease;
      }
      .frw-button:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      .frw-button:disabled {
        opacity: 0.7;
        cursor: default;
      }
      .frw-status {
        margin: 10px 0 0 0;
        font-size: 13px;
        font-weight: 600;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  async function init() {
    let config;
    try {
      const res = await fetch(`${apiOrigin}/widgets/${widgetId}/config`);
      if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
      config = await res.json();
    } catch (err) {
      console.error('[widget] could not load config:', err.message);
      return;
    }

    render(config);
  }

  function render(config) {
    const container = document.createElement('div');
    container.className = 'frw-container';

    const title = document.createElement('h3');
    title.textContent = config.title;
    title.className = 'frw-title';
    container.appendChild(title);

    if (config.description) {
      const desc = document.createElement('p');
      desc.textContent = config.description;
      desc.className = 'frw-desc';
      container.appendChild(desc);
    }

    const form = document.createElement('form');

    // A minimal, always-present email field for a signup-style widget.
    // (A fuller build would render one input per entry in config.fields.)
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.name = 'email';
    emailInput.placeholder = 'you@example.com';
    emailInput.required = true;
    emailInput.className = 'frw-input';
    form.appendChild(emailInput);

    // Honeypot field — hidden from real visitors via CSS, bots often fill it anyway
    const honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = '_hp';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.style.cssText = 'position:absolute;left:-9999px;';
    form.appendChild(honeypot);

    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = config.button_text;
    button.className = 'frw-button';
    form.appendChild(button);

    const statusMsg = document.createElement('p');
    statusMsg.className = 'frw-status';
    form.appendChild(statusMsg);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      button.disabled = true;
      statusMsg.textContent = '';

      const payload = {
        email: emailInput.value,
        _hp: honeypot.value,
      };

      try {
        const res = await fetch(`${apiOrigin}/widgets/${widgetId}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.status === 429) {
          statusMsg.textContent = 'Too many submissions — please try again in a minute.';
        } else if (!res.ok) {
          statusMsg.textContent = 'Something went wrong — please try again.';
        } else {
          statusMsg.textContent = 'Thank you! 🎉';
          form.reset();
        }
      } catch (err) {
        statusMsg.textContent = 'Network error — please try again.';
      } finally {
        button.disabled = false;
      }
    });

    container.appendChild(form);
    thisScript.parentNode.insertBefore(container, thisScript.nextSibling);
  }

  init();
})();