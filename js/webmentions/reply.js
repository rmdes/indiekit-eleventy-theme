/**
 * webmentions/reply.js — owner-only inline reply form + Micropub submission.
 * Moved verbatim from js/webmentions.js. Self-contained (builds its own DOM);
 * reads owner state from the global Alpine store set up by comments.js.
 */

// Close any open inline reply form
export function closeActiveReplyForm() {
  var existing = document.querySelector('.wm-inline-reply-form');
  if (existing) existing.remove();
}

// Submit a Micropub reply
export function submitMicropubReply(replyUrl, platform, syndicateTo, textarea, statusEl, submitBtn) {
  var content = textarea.value.trim();
  if (!content) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';
  statusEl.textContent = '';

  var body = {
    type: ['h-entry'],
    properties: {
      content: [content],
      'in-reply-to': [replyUrl]
    }
  };

  if (syndicateTo) {
    body.properties['mp-syndicate-to'] = [syndicateTo];
  }

  fetch('/micropub', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  }).then(function (res) {
    if (res.ok || res.status === 201 || res.status === 202) {
      statusEl.className = 'text-xs text-green-600 dark:text-green-400 mt-1';
      statusEl.textContent = 'Reply posted' + (syndicateTo ? ' and syndicated!' : '!');
      textarea.value = '';
      setTimeout(closeActiveReplyForm, 2000);
    } else {
      return res.json().catch(function () { return {}; }).then(function (data) {
        statusEl.className = 'text-xs text-red-600 dark:text-red-400 mt-1';
        statusEl.textContent = data.error_description || data.error || 'Failed to post reply';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reply';
      });
    }
  }).catch(function (err) {
    statusEl.className = 'text-xs text-red-600 dark:text-red-400 mt-1';
    statusEl.textContent = 'Error: ' + err.message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Reply';
  });
}

// Wire reply buttons: unhide and attach click handlers for unwired buttons.
// Called from the owner:detected handler AND after dynamic replies are appended.
export function wireReplyButtons() {
  var Alpine = window.Alpine;
  var ownerStore = Alpine && Alpine.store && Alpine.store('owner');
  if (!ownerStore || !ownerStore.isOwner) return;

  document.querySelectorAll('.wm-reply-btn').forEach(function (btn) {
    if (btn.dataset.wired) return; // already wired
    btn.dataset.wired = 'true';
    btn.classList.remove('hidden');
    btn.addEventListener('click', function () {
      var replyUrl = btn.dataset.replyUrl;
      var platform = btn.dataset.platform || 'webmention';
      // Map platform to syndicator via replyTargets config
      var targets = ownerStore.syndicationTargets || {};
      var replyTargets = ownerStore.replyTargets || {};
      var serviceName = replyTargets[platform] || null;
      var syndicateTo = serviceName ? (targets[serviceName] || null) : null;

      // Close any existing reply form
      closeActiveReplyForm();

      // Find the owner-reply-slot next to this webmention card
      var li = btn.closest('li') || btn.closest('.webmention-reply');
      var slot = li ? li.querySelector('.wm-owner-reply-slot') : null;
      if (!slot) {
        // Fallback: insert after the button's parent
        slot = document.createElement('div');
        btn.parentElement.after(slot);
      }

      // Build inline reply form
      var form = document.createElement('div');
      form.className = 'wm-inline-reply-form mt-2 p-3 bg-surface-100 dark:bg-surface-900 rounded-lg border-l-2 border-primary-400';

      var label = document.createElement('div');
      label.className = 'text-xs text-surface-500 dark:text-surface-400 mb-1';
      label.textContent = 'Replying via ' + platform + (syndicateTo ? ' (will syndicate)' : '');

      var textarea = document.createElement('textarea');
      textarea.rows = 3;
      textarea.placeholder = 'Write your reply...';
      textarea.className = 'w-full px-3 py-2 border rounded-lg text-sm dark:bg-surface-800 dark:border-surface-700 dark:text-surface-100';

      var actions = document.createElement('div');
      actions.className = 'flex items-center gap-2 mt-2';

      var submitBtn = document.createElement('button');
      submitBtn.className = 'button text-sm';
      submitBtn.textContent = 'Send Reply';

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'text-xs text-surface-500 hover:underline';
      cancelBtn.textContent = 'Cancel';

      var statusEl = document.createElement('div');
      statusEl.className = 'text-xs mt-1';

      submitBtn.addEventListener('click', function () {
        submitMicropubReply(replyUrl, platform, syndicateTo, textarea, statusEl, submitBtn);
      });
      cancelBtn.addEventListener('click', closeActiveReplyForm);

      actions.appendChild(submitBtn);
      actions.appendChild(cancelBtn);
      form.appendChild(label);
      form.appendChild(textarea);
      form.appendChild(actions);
      form.appendChild(statusEl);
      slot.appendChild(form);

      textarea.focus();
    });
  });
}
