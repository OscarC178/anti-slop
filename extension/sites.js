/*
 * Anti-Slop — per-site DOM map.
 *
 * Each site says: how to recognise a post, where its text lives, and which
 * element to hide. Selectors are lists because the platforms change markup
 * often; the first one that matches wins. Unknown sites fall through to null
 * and the content script does nothing.
 */
(function (root) {
  'use strict';

  const SITES = {
    x: {
      id: 'x', name: 'X / Twitter',
      host: /(^|\.)(x|twitter)\.com$/,
      // Every tweet in the timeline, replies, search, profile.
      post: ['article[data-testid="tweet"]'],
      // Tweet body text (includes quoted tweets, which is fine).
      text: ['[data-testid="tweetText"]'],
      // "Show more" button on posts longer than 280 characters (expands in place).
      more: ['[data-testid="tweet-text-show-more-link"]'],
      // Hide the whole timeline cell so no empty gap is left.
      hideTarget(post) { return post.closest('[data-testid="cellInnerDiv"]') || post; },
      // A stable id for the post, so a recycled cell is re-checked.
      key(post) {
        const a = post.querySelector('a[href*="/status/"]');
        return a ? a.getAttribute('href') : null;
      },
    },
    linkedin: {
      id: 'linkedin', name: 'LinkedIn',
      host: /(^|\.)linkedin\.com$/,
      post: [
        // 2026 server-driven feed (obfuscated classes; these attributes are the stable hooks)
        'div[componentkey^="update-card-focus"]',
        // classic feed markup, kept as fallbacks
        'div.feed-shared-update-v2',
        'div[data-urn^="urn:li:activity"]',
        'div[data-id^="urn:li:activity"]',
        'div[data-view-name="feed-full-update"]',
        'div[data-urn^="urn:li:aggregate"]',
      ],
      text: [
        '[data-testid="expandable-text-box"]',
        '.update-components-text',
        '.feed-shared-update-v2__description',
        '.feed-shared-inline-show-more-text',
        '[data-view-name="feed-commentary"]',
        '.update-components-update-v2__commentary',
        '.attributed-text-segment-list__content',
      ],
      // Not part of the post chrome for label detection: comments and the author's headline,
      // otherwise a comment saying "this is AI-generated" would hide the post.
      exclude: [
        '.comments-comments-list', '.feed-shared-update-v2__comments-container',
        '[data-view-name="comment"]', '.comments-comment-item', '.update-components-actor__description',
      ],
      // Only the first text box is the post body; later ones are comments.
      firstTextOnly: true,
      // "…more" button; the rest of a long post is fetched when it is pressed.
      more: ['[data-testid="expandable-text-button"]', '.feed-shared-inline-show-more-text__see-more-less-toggle'],
      hideTarget(post) { return post; },
      key(post) { return post.getAttribute('componentkey') || post.getAttribute('data-urn') || post.getAttribute('data-id') || null; },
    },
    tiktok: {
      id: 'tiktok', name: 'TikTok',
      host: /(^|\.)tiktok\.com$/,
      post: [
        '[data-e2e="recommend-list-item-container"]',
        '[data-e2e="search_video-item"]',
        '[data-e2e="explore-item"]',
        '[data-e2e="user-post-item"]',
        'article[data-e2e]',
      ],
      text: [
        '[data-e2e="video-desc"]',
        '[data-e2e="browse-video-desc"]',
        '[data-e2e="new-desc-span"]',
        '[data-e2e="search-card-desc"]',
        '[data-e2e="explore-card-desc"]',
      ],
      exclude: ['[data-e2e="comment-list"]', '[data-e2e="comment-level-1"]', '[data-e2e="comment-level-2"]'],
      hideTarget(post) { return post; },
      key(post) {
        const a = post.querySelector('a[href*="/video/"]');
        return a ? a.getAttribute('href') : null;
      },
    },
    instagram: {
      id: 'instagram', name: 'Instagram',
      host: /(^|\.)instagram\.com$/,
      // Home feed and profile grids render each post as an <article>.
      // Reels (/reels/, checked live 14 Nov 2026) have no <article>: each reel is a child of a
      // div[aria-busy] scroller holding exactly one <video>; class names are generated, so none are used.
      post: ['article', 'div[data-media-type]', 'main div[aria-busy] > div:has(video):not(:has(article))'],
      // Live feed (verified Nov 2026): the caption is a regular-weight span._aacu[dir=auto]
      // (the bold author name is _aacw). Older/permalink layouts used an <h1>. First match only.
      // Reels fall through to every span[dir=auto] (username, counts, audio, caption); see pickText.
      text: ['h1', 'span._aacu[dir="auto"]', 'span[dir="auto"]'],
      // Feed: first caption match only. Reels: the caption is the longest text span in the reel.
      // Never fall back to the generic spans inside an <article>, where they would be comments.
      pickText(nodes, post) {
        if (nodes[0].matches('h1, span._aacu')) return nodes.slice(0, 1);
        if (post.matches('article') || post.closest('article')) return [];
        const len = n => (n.textContent || '').trim().length;
        return [nodes.reduce((a, b) => (len(b) > len(a) ? b : a))];
      },
      // A truncated caption ends with "… more" inside the same span; drop it before scoring.
      stripText: /\s*(\.\.\.|…)\s*more\s*$/i,
      // Comments must not count as the post's "chrome" for label matching.
      exclude: ['ul', '[role="dialog"]', 'form'],
      // "more" is a text button, not a stable selector: look through these for the word.
      more: ['div[role="button"]', 'button', 'span[role="button"]'],
      moreText: /^(…\s*)?more$/i,
      hideTarget(post) { return post; },
      key(post) {
        const a = post.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]');
        return a ? a.getAttribute('href') : null;
      },
    },
  };

  function siteFor(hostname) {
    for (const s of Object.values(SITES)) if (s.host.test(hostname)) return s;
    return null;
  }

  const api = { SITES, siteFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AntiSlopSites = api;
})(typeof self !== 'undefined' ? self : this);
