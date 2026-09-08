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
      container.style.cssText =
        'max-width:360px;border:1px solid #ddd;border-radius:8px;padding:16px;font-family:sans-serif;';
  
      const title = document.createElement('h3');
      title.textContent = config.title;
      title.style.margin = '0 0 8px 0';
      container.appendChild(title);
  
      if (config.description) {
        const desc = document.createElement('p');
        desc.textContent = config.description;
        desc.style.cssText = 'margin:0 0 12px 0;color:#555;font-size:14px;';
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
      emailInput.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;margin-bottom:8px;';
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
      button.style.cssText = 'width:100%;padding:8px;cursor:pointer;';
      form.appendChild(button);
  
      const statusMsg = document.createElement('p');
      statusMsg.style.cssText = 'margin:8px 0 0 0;font-size:13px;';
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
            statusMsg.textContent = 'Thank you!';
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