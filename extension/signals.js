/*
 * Anti-Slop — codified AI-writing signals.
 *
 * This is the "locked-in" list. Every signal is a pure function over the post
 * text; nothing here talks to the network and nothing costs money.
 *
 * Sources (see README for links):
 *   [W]  Wikipedia: "Signs of AI writing" (WikiProject AI Cleanup)
 *   [H]  blader/humanizer SKILL.md (26 patterns)
 *   [G]  Graphite Growth "corrective framing" study, 2026 press coverage
 *   [P]  Pangram "9 signs of AI writing"
 *
 * Each signal returns a number of points (0 = no hit). Most give 1 point; the
 * strongest tells give 2. The popup lets the user switch any signal off.
 *
 * Loaded as a plain script in the extension and as a CommonJS module in tests.
 */
(function (root) {
  'use strict';

  // ---------- helpers ----------

  // Straighten curly apostrophes/quotes so one regex covers both.
  function straighten(s) {
    return s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
  }

  function countMatches(re, s) {
    const m = s.match(re);
    return m ? m.length : 0;
  }

  function nonEmptyLines(text) {
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  }

  function wordCount(s) {
    return (s.match(/[A-Za-z0-9'’]+/g) || []).length;
  }

  // Words/phrases that LLMs over-use. Deliberately excludes very common words
  // ("journey", "matters", "practical") that would flag ordinary humans. [W 3.1][H 12][W 2.1]
  const AI_VOCAB = [
    'delve', 'delves', 'delving', 'tapestry', 'testament', 'pivotal', 'crucial',
    'landscape', 'robust', 'leverage', 'leverages', 'leveraging', 'game-changer',
    'game changer', 'game-changing', 'cutting-edge', 'seamless', 'seamlessly',
    'underscore', 'underscores', 'underscoring', 'showcase', 'showcases', 'showcasing',
    'elevate', 'elevates', 'unlock', 'unlocks', 'unlocking', 'realm', 'embark', 'embarking',
    'meticulous', 'meticulously', 'foster', 'fosters', 'fostering', 'harness', 'harnessing',
    'empower', 'empowers', 'empowering', 'transformative', 'vibrant', 'multifaceted',
    'holistic', 'synergy', 'ever-evolving', 'fast-paced', 'deep dive', 'double-edged sword',
    'paradigm', 'groundbreaking', 'revolutionary', 'revolutionize', 'revolutionise',
    'beacon', 'bustling', 'intricate', 'intricacies', 'interplay', 'garner', 'bolster',
    'bolstered', 'resonate', 'resonates', 'dependable', 'additionally', 'furthermore',
    'moreover', 'enhance', 'enhances', 'enhancing', 'streamline', 'streamlined',
    'actionable', 'supercharge', 'skyrocket', 'unleash', 'unleashing', 'superpower',
    'unprecedented', 'next-level', 'world-class', 'navigating', 'navigate the',
    'in the ever', "in today's", 'at the forefront', 'a myriad of', 'plethora',
    'nuanced', 'reimagine', 'reimagining', 'redefine', 'redefining', 'unparalleled',
    'frictionless', 'turbocharge', 'laser-focused', 'north star', 'move the needle',
    'thought leader', 'thought leadership', 'visionary', 'trailblazer',
  ];
  const AI_VOCAB_RE = new RegExp('\\b(' + AI_VOCAB.map(w => w.replace(/[-.]/g, '\\$&')).join('|') + ')\\b', 'g');

  // Unicode emoji (pictographs) used as bullets.
  const EMOJI_LINE_RE = /^(?:\p{Extended_Pictographic}|[✅✔❌⭐➡→▪▸•☑✓])/u;

  // ---------- the signals ----------
  // id, name, group, weight (max points), defaultOn, description, source, test(ctx)

  const SIGNALS = [
    {
      id: 'not_x_but_y', name: 'Not X, but Y', group: 'Staging', weight: 2, defaultOn: true,
      description: '"It\'s not X, it\'s Y", "not just X but Y", "not because X but because Y", "rather than".',
      source: '[H1][W3.3][G]',
      test(ctx) {
        const t = ctx.lower;
        const strong = [
          /\bnot (just|only|merely|simply|about) [^.!?\n]{1,80}?\b(but|it'?s|they'?re)\b/,
          /\b(it'?s|this is|that'?s|this|it|that|he'?s|she'?s|we'?re|you'?re|i'?m) (isn'?t|is not|wasn'?t|was not|aren'?t|not) (about |just |only |really )?[^.!?\n]{1,80}[.,;!—–-]\s*(it'?s|this is|that'?s|it is|they'?re|but|we'?re|you'?re|i'?m|he'?s|she'?s)\b/,
          /\bnot because [^.!?\n]{1,80}\b(but )?because\b/,
          /\bno [a-z]+,? no [a-z]+[,.]? (just|only|simply)\b/,
          /\b(isn'?t|is not|aren'?t|doesn'?t|don'?t) [^.!?\n]{1,60}[,.;] (it'?s|they'?re|it is|it does|they do)\b/,
          /\bnot (a|an) [a-z]+, (a|an) [a-z]+\b/,
          /\bless [a-z ]{1,25}, more [a-z]+/,
          /\bnot (x|y|the|a|an|about) [^.!?\n]{1,40}\. (but|it'?s|that'?s|this is) /,
          /\b(it'?s|that'?s|this is|they'?re|we'?re) not\.\s+(it'?s|that'?s|this is|they'?re|we'?re)\b/,
          /\bnot about [^.!?\n]{1,60}[.,;] (it'?s|that'?s|this is) about\b/,
        ];
        let hits = 0;
        for (const re of strong) hits += countMatches(new RegExp(re.source, 'g'), t);
        if (hits >= 2) return { points: 2, evidence: hits + ' contrast frames' };
        if (hits === 1) return { points: 2, evidence: 'contrast frame' };
        if (/\brather than\b/.test(t)) return { points: 1, evidence: '"rather than"' };
        return null;
      },
    },
    {
      id: 'em_dash', name: 'Dashes as glue', group: 'Rhythm', weight: 2, defaultOn: true,
      description: 'Em dashes (—), spaced en dashes or double hyphens joining clauses. 1 point for one, 2 for three or more.',
      source: '[H8][W13][P]',
      test(ctx) {
        const n = countMatches(/—|\s–\s|\s--\s/g, ctx.text);
        if (n >= 3) return { points: 2, evidence: n + ' dashes' };
        if (n >= 1 && ctx.words >= 12) return { points: 1, evidence: n + ' dash' + (n > 1 ? 'es' : '') };
        return null;
      },
    },
    {
      id: 'ai_vocab', name: 'AI vocabulary', group: 'Inflation', weight: 2, defaultOn: true,
      description: 'Over-used LLM words: delve, tapestry, testament, pivotal, leverage, game-changer, seamless, unlock, elevate, robust... 2 distinct words = 1 point, 4+ = 2.',
      source: '[W3.1][H12][W2.1]',
      test(ctx) {
        const found = new Set();
        let m;
        AI_VOCAB_RE.lastIndex = 0;
        while ((m = AI_VOCAB_RE.exec(ctx.lower))) found.add(m[1]);
        if (found.size >= 4) return { points: 2, evidence: [...found].slice(0, 5).join(', ') };
        if (found.size >= 2) return { points: 1, evidence: [...found].join(', ') };
        return null;
      },
    },
    {
      id: 'closers', name: 'Dramatic one-liners', group: 'Staging', weight: 2, defaultOn: true,
      description: '"Let that sink in", "Read that again", "That\'s the real win", "Full stop.", "every. single. day."',
      source: '[H2]',
      test(ctx) {
        const re = /\b(let that sink in|read that again|that'?s the (real |whole )?(win|point|difference|lesson|game|secret|takeaway|shift|job|work|skill|edge|move|play|gap|trap|unlock|flex|goal)\b|that'?s it\.? that'?s the (post|tweet|message)|full stop\.|that distinction matters|here'?s why (that|this|it) matters|and that'?s (exactly )?(the point|why)|every\. single\. (day|time|one)\.|that'?s the whole (point|thing|game)|nothing (more|less)\.|simple as that\.|it'?s that simple\.|and that changes everything|that'?s not nothing)/;
        const m = ctx.lower.match(re);
        return m ? { points: 2, evidence: '"' + m[0].trim() + '"' } : null;
      },
    },
    {
      id: 'openers', name: 'Staged run-up', group: 'Staging', weight: 1, defaultOn: true,
      description: '"Here\'s the thing", "Let\'s be honest", "Real talk", "Hot take:", "Unpopular opinion:", "Let\'s dive in", "Plot twist".',
      source: '[H4]',
      test(ctx) {
        const re = /(^|\n|[.!?]\s)(here'?s the thing|let'?s be honest|real talk|hot take|unpopular opinion|let'?s dive in|let'?s break (this|it) down|here'?s what you need to know|here'?s what (nobody|no one|most people) (tells|tell|won'?t tell) you|honestly\?|look,|the thing is|let me explain|quick note|plot twist|i'?ll be honest|i'?ll say it|here'?s the (truth|reality|kicker|catch)|the truth\?|a (quick )?thread|🧵)/;
        const m = ctx.lower.match(re);
        return m ? { points: 1, evidence: '"' + m[2].trim() + '"' } : null;
      },
    },
    {
      id: 'profound', name: 'Sayings that sound deep', group: 'Staging', weight: 1, defaultOn: true,
      description: '"The real question is", "at its core", "what really matters", "X is the new Y", "X is the currency of Z", "X becomes a trap".',
      source: '[H3]',
      test(ctx) {
        const re = /\b(the real question is|at its core|what really matters|the deeper (issue|problem|question)|the heart of the matter|is the new [a-z]+\b|is a mirror\b|is the (currency|language|architecture|foundation|backbone|engine) of|becomes a trap|in reality,|fundamentally,|the (real|true) (cost|work|skill|value) (is|was|isn'?t)|is a (feature|bug), not a (bug|feature))/;
        const m = ctx.lower.match(re);
        return m ? { points: 1, evidence: '"' + m[0].trim() + '"' } : null;
      },
    },
    {
      id: 'strawman', name: 'Arguing with no one', group: 'Staging', weight: 1, defaultOn: true,
      description: '"I\'m not saying", "To be clear", "Don\'t get me wrong", "This isn\'t about", "Some might say", "Most people think".',
      source: '[H5]',
      test(ctx) {
        const re = /\b(i'?m not saying|to be clear|don'?t get me wrong|this (isn'?t|is not) (mainly |really )?about|some (might|will|would) (say|argue)|some people (will|might) say|you might think|it would be easy to|most people (think|believe|assume|get this wrong)|one might|the easy answer|this is not to say|contrary to popular belief|spoiler( alert)?:)/;
        const m = ctx.lower.match(re);
        return m ? { points: 1, evidence: '"' + m[0].trim() + '"' } : null;
      },
    },
    {
      id: 'rhetorical_qa', name: 'Question-then-answer', group: 'Staging', weight: 1, defaultOn: true,
      description: 'Self-interview beats: "The result?", "The catch?", "Why? Because", "Sound familiar?", "The best part?"',
      source: '[H2][P]',
      test(ctx) {
        const re = /(^|\s)(the (result|catch|problem|lesson|takeaway|best part|worst part|irony|kicker|truth|difference|answer|reason|outcome|cost|twist|secret|hard part|good news|bad news|fix|solution|verdict|upshot|reality|outcome)\?|why\? because|the reason\?|sound familiar\?|what changed\?|what happened( next)?\?|my take\?|the (lesson|moral)\?|guess what\?)/;
        const m = ctx.lower.match(re);
        return m ? { points: 1, evidence: '"' + m[2].trim() + '"' } : null;
      },
    },
    {
      id: 'emoji_bullets', name: 'Emoji bullets and arrows', group: 'Formatting', weight: 2, defaultOn: true,
      description: 'Lines that start with ✅ 🚀 👉 → • or any emoji. 2 lines = 1 point, 4+ = 2. Also counts → arrows in running text.',
      source: '[H20][W4]',
      test(ctx) {
        let n = 0;
        for (const l of ctx.lines) if (EMOJI_LINE_RE.test(l)) n++;
        const arrows = countMatches(/→|➡️|👉/g, ctx.text);
        const total = Math.max(n, arrows >= 2 ? arrows : 0);
        if (total >= 4) return { points: 2, evidence: total + ' emoji/arrow lines' };
        if (total >= 2) return { points: 1, evidence: total + ' emoji/arrow lines' };
        return null;
      },
    },
    {
      id: 'unicode_bold', name: 'Fake bold / italic letters', group: 'Formatting', weight: 1, defaultOn: true,
      description: 'Mathematical-alphabet characters (𝗯𝗼𝗹𝗱, 𝘪𝘵𝘢𝘭𝘪𝘤) used to decorate plain-text posts.',
      source: '[H19][W4]',
      test(ctx) {
        const n = countMatches(/[\u{1D400}-\u{1D7FF}]/gu, ctx.text);
        return n >= 3 ? { points: 1, evidence: n + ' styled letters' } : null;
      },
    },
    {
      id: 'bold_labels', name: 'Label: text bullets', group: 'Formatting', weight: 1, defaultOn: true,
      description: 'Three or more lines shaped "Label: explanation", or markdown ** / ### leaking into a post.',
      source: '[H19][W4][W6]',
      test(ctx) {
        let n = 0;
        for (const l of ctx.lines) if (/^(?:[✅✔•▪→-]\s*)?(\*\*)?[A-Z][A-Za-z0-9' ]{1,30}(\*\*)?:\s+\S/.test(l)) n++;
        const md = countMatches(/\*\*[^*\n]{2,60}\*\*|^#{1,3}\s|^---\s*$/gm, ctx.text);
        if (md >= 2) return { points: 1, evidence: 'markdown leaked' };
        return n >= 3 ? { points: 1, evidence: n + ' label lines' } : null;
      },
    },
    {
      id: 'rule_of_three', name: 'Rule of three', group: 'Rhythm', weight: 1, defaultOn: true,
      description: 'Two or more "A, B, and C" triads, or a staccato triad like "Simple. Fast. Reliable."',
      source: '[H6][W3.5]',
      test(ctx) {
        const triads = countMatches(/[^.!?\n:,]{3,40}, [^.!?\n:,]{3,40},? (and|or) [^.!?\n,]{3,40}[.!?\n]/g, ctx.text + '\n');
        const staccato = /(^|[.!?]\s+)([A-Z][a-z]{2,14}\. ){2}[A-Z][a-z]{2,14}\./.test(ctx.text);
        if (triads >= 2 && staccato) return { points: 1, evidence: 'triads + staccato triad' };
        if (triads >= 2) return { points: 1, evidence: triads + ' triads' };
        if (staccato) return { points: 1, evidence: 'staccato triad' };
        return null;
      },
    },
    {
      id: 'broetry', name: 'One-line paragraphs', group: 'Rhythm', weight: 1, defaultOn: true,
      description: 'Six or more lines where most are under 12 words: the LinkedIn "broetry" layout of rows of fragments.',
      source: '[H2][H7]',
      test(ctx) {
        if (ctx.lines.length < 6) return null;
        const short = ctx.lines.filter(l => wordCount(l) <= 12).length;
        return short / ctx.lines.length >= 0.7 ? { points: 1, evidence: ctx.lines.length + ' short lines' } : null;
      },
    },
    {
      id: 'hashtag_stack', name: 'Hashtag stack', group: 'Formatting', weight: 1, defaultOn: true,
      description: 'Five or more hashtags.',
      source: '[H20]',
      test(ctx) {
        const n = countMatches(/(^|\s)#[\p{L}\p{N}_]+/gu, ctx.text);
        return n >= 5 ? { points: 1, evidence: n + ' hashtags' } : null;
      },
    },
    {
      id: 'engagement_bait', name: 'Engagement bait', group: 'Inflation', weight: 1, defaultOn: true,
      description: '"Agree?", "Thoughts?", "Repost if", "Comment X and I\'ll send", "Follow for more", "Tag someone".',
      source: '[H17][P]',
      test(ctx) {
        const re = /(^|\s)(agree\?|thoughts\?|what do you think\?|what'?s your take\?|repost (this )?if|share (this )?if|comment ["'“]?[a-z0-9]+["'”]? (below )?(and|&) i'?ll|follow (me )?for more|drop a |tag (someone|a friend)|let me know in the comments|save this (post|one|for later)|hit (the )?follow|like if you agree|double tap|♻️ repost|bookmark this)/;
        const m = ctx.lower.match(re);
        return m ? { points: 1, evidence: '"' + m[2].trim() + '"' } : null;
      },
    },
    {
      id: 'inflated', name: 'Inflated significance', group: 'Inflation', weight: 2, defaultOn: true,
      description: '"a testament to", "plays a pivotal role", "in today\'s fast-paced world", "ever-evolving landscape", "this changes everything", "game changer", "now more than ever".',
      source: '[H13][W2.1]',
      test(ctx) {
        const re = /\b(stands as a testament|a testament to|plays? a (key|pivotal|crucial|vital) role|in today'?s (fast-paced|digital|rapidly|ever-changing|hyper|competitive|ai)|ever-evolving|evolving landscape|the future of [a-z ]{2,20} is (here|now|bright)|this changes everything|game[- ]?changer|game[- ]changing|paradigm shift|changed the game|indelible mark|(lasting|enduring) legacy|sets? the stage for|marks? a (shift|turning point)|a (key|crucial|pivotal) moment|now more than ever|we'?re (just|only) getting started|the (ai )?revolution is here|the (ai )?(era|age) (is here|has arrived)|a new era of|at the forefront of|will never be the same|the rules have changed|wake[- ]up call)\b/g;
        const m = ctx.lower.match(re);
        if (!m) return null;
        return m.length >= 2 ? { points: 2, evidence: m.slice(0, 3).join('; ') } : { points: 1, evidence: '"' + m[0] + '"' };
      },
    },
    {
      id: 'trailing_ing', name: 'Trailing -ing phrases', group: 'Inflation', weight: 2, defaultOn: true,
      description: 'Sentences ending ", ensuring...", ", highlighting...", ", fostering...", ", paving the way...".',
      source: '[H15][W2.3]',
      test(ctx) {
        const n = countMatches(/, (ensuring|highlighting|underscoring|emphasi[sz]ing|reflecting|showcasing|fostering|empowering|enabling|allowing|paving the way|setting the stage|making it easier|signalling|signaling|cementing|solidifying|reinforcing|unlocking|driving|transforming) /g, ctx.lower);
        if (n >= 2) return { points: 2, evidence: n + ' trailing -ing phrases' };
        if (n === 1) return { points: 1, evidence: 'trailing -ing phrase' };
        return null;
      },
    },
    {
      id: 'chatbot_residue', name: 'Chatbot residue', group: 'Leftovers', weight: 2, defaultOn: true,
      description: 'Text pasted straight from a chat: "I hope this helps", "Certainly!", "Great question", "As an AI", "Here\'s a concise post", "[insert name]".',
      source: '[H22][W5]',
      test(ctx) {
        // Two halves: word-bounded phrases, and [placeholders] left in from a template (no \b before "[").
        const re = /\b(i hope this helps|certainly!|of course!|great question|as an ai\b|as a language model|you'?re absolutely right|would you like me to|let me know if you(?:'?d like| need| want)|here'?s a (?:(?:concise|short|quick|draft|polished|linkedin|revised|punchy|improved|better|suggested|sample) )*(summary|breakdown|version|draft|post|rewrite|caption)|here is a (?:(?:concise|short|quick|draft|polished|linkedin|revised|suggested|sample) )*(summary|breakdown|version|draft|post|caption))|\[(insert |your (name|company|product)\]|link\]|name\]|company\]|date\]|product\])/;
        const m = ctx.lower.match(re);
        return m ? { points: 2, evidence: '"' + m[0].trim() + '"' } : null;
      },
    },
    {
      id: 'hedging', name: 'Knowledge-limit hedges', group: 'Leftovers', weight: 2, defaultOn: true,
      description: '"As of my last update", "based on available information", "while specific details are limited", "it is believed that".',
      source: '[H23][W5]',
      test(ctx) {
        const re = /\b(as of my (last|latest) (update|training)|based on (the )?available information|while specific details are (limited|scarce)|not widely documented|up to my last|it is (widely )?believed that|as of \d{4}, )/;
        const m = ctx.lower.match(re);
        return m ? { points: 2, evidence: '"' + m[0].trim() + '"' } : null;
      },
    },
    {
      id: 'summary_markers', name: 'Summary markers', group: 'Leftovers', weight: 1, defaultOn: true,
      description: '"In summary", "In conclusion", "TL;DR", "Key takeaways", "The bottom line", "Final thought".',
      source: '[W5][H24]',
      test(ctx) {
        const re = /(^|\n|[.!?]\s)(in summary|in conclusion|tl;?dr|key takeaways?|the bottom line|bottom line:|final thoughts?|the takeaway|takeaways?:|to sum (it )?up|the lesson(?: here)?:)/;
        const m = ctx.lower.match(re);
        return m ? { points: 1, evidence: '"' + m[2].trim() + '"' } : null;
      },
    },
    {
      id: 'curly_quotes', name: 'Curly quotes', group: 'Formatting', weight: 1, defaultOn: false,
      description: 'Typographic “quotes” and ’apostrophes. Off by default: phones add these automatically, so it flags humans too.',
      source: '[H21][W4]',
      test(ctx) {
        // ctx.text has quotes straightened for the other signals, so look at the raw text.
        const n = countMatches(/[“”]/g, ctx.raw);
        return n >= 2 ? { points: 1, evidence: n + ' curly quotes' } : null;
      },
    },
    {
      id: 'vague_authority', name: 'Borrowed authority', group: 'Inflation', weight: 1, defaultOn: true,
      description: '"Experts argue", "studies show", "research suggests", "industry reports", "observers have noted" with no source named.',
      source: '[H17][W2.5]',
      test(ctx) {
        const re = /\b(experts? (argue|agree|say|suggest|warn)|studies (show|suggest|have shown)|research (shows|suggests|indicates)|industry (reports|leaders|experts)|observers have|many (people|experts|leaders) (believe|agree)|it'?s (widely|well) (known|understood|accepted))\b/;
        const m = ctx.lower.match(re);
        return m ? { points: 1, evidence: '"' + m[0].trim() + '"' } : null;
      },
    },
  ];

  // ---------- platform AI labels and self-disclosure (level 1) ----------
  // Phrases checked in the post chrome (label areas) and hashtags/disclosures in the text.
  const LABEL_PHRASES = [
    'made with ai', 'ai-generated', 'ai generated', 'ai info', 'imagined with ai', 'meta ai', 'creator labeled as ai-generated',
    'creator labelled as ai-generated', 'labeled as ai', 'labelled as ai', 'content credentials',
    'generated with grok', 'made with grok', 'created with grok', 'ai label',
    'this content was created with ai', 'created with ai', 'produced with ai',
    'synthetic media', 'manipulated media', 'ai-altered', 'ai altered',
  ];
  const DISCLOSURE_RE = /(^|\s)#(aigenerated|aiart|aiartwork|aivideo|aiimage|aiimages|madewithai|generatedwithai|createdwithai|sora|sora2|midjourney|grokimagine|grokai|veo3|veo|dalle|stablediffusion|aimusic|sunoai|runwayml|kling|klingai|aiphoto|aiphotography|aicontent|chatgptart)\b|\b(made with (grok|sora|midjourney|dall-?e|veo|kling|runway|chatgpt|gemini)|generated (by|with|using) (grok|sora|midjourney|dall-?e|veo|kling|runway|chatgpt|gemini|ai)|written (by|with) (chatgpt|claude|gemini|ai)|ai[- ]generated (image|video|art|clip|photo|content))\b/i;

  // ---------- scoring ----------

  function buildContext(text) {
    const clean = straighten(text || '').replace(/ /g, ' ');
    return {
      raw: text || '',
      text: clean,
      lower: clean.toLowerCase(),
      lines: nonEmptyLines(clean),
      words: wordCount(clean),
    };
  }

  /**
   * Score a post's text.
   * @param {string} text            the post body
   * @param {object} enabled         map of signal id -> boolean (missing = defaultOn)
   * @returns {{points:number, hits:Array<{id,name,points,evidence}>, words:number}}
   */
  function score(text, enabled) {
    const ctx = buildContext(text);
    const hits = [];
    let points = 0;
    if (ctx.words < 8) return { points: 0, hits, words: ctx.words };
    for (const sig of SIGNALS) {
      const on = enabled && Object.prototype.hasOwnProperty.call(enabled, sig.id) ? enabled[sig.id] : sig.defaultOn;
      if (!on) continue;
      let r = null;
      try { r = sig.test(ctx); } catch (e) { r = null; }
      if (r && r.points > 0) {
        const p = Math.min(r.points, sig.weight);
        hits.push({ id: sig.id, name: sig.name, points: p, evidence: r.evidence });
        points += p;
      }
    }
    return { points, hits, words: ctx.words };
  }

  /** Level 1: does the post carry a platform AI label or self-disclosure? */
  function labelled(chromeText, bodyText) {
    const c = (chromeText || '').toLowerCase();
    for (const p of LABEL_PHRASES) if (c.includes(p)) return 'label: "' + p + '"';
    const m = (bodyText || '').match(DISCLOSURE_RE);
    if (m) return 'disclosure: "' + m[0].trim() + '"';
    return null;
  }

  const api = { SIGNALS, score, labelled, buildContext, AI_VOCAB, LABEL_PHRASES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AntiSlopSignals = api;
})(typeof self !== 'undefined' ? self : this);
