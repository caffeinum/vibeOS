/**
 * Skills and themes for the vibeOS agent.
 *
 * A *skill* is reusable know-how appended to the system prompt. A *theme* is
 * the visual contract generated apps are held to. Both live here rather than
 * inside a prompt string because there are two prompt paths — the Codex route
 * on the server and the paste-key path in the browser — and a design rule that
 * only reaches one of them is worse than no rule at all.
 *
 * Loaded as a browser global (<script src="/app/skills.js">) and imported by
 * lib/system-prompt.ts on the server. Plain JS, no bundler.
 */
var VibeOSSkills = (function () {
  // The desktop's own tokens, copied from the :root block in index.html. Apps
  // mount inside that document, so these custom properties are already
  // inherited — a generated app referencing var(--text) tracks the desktop
  // instead of drifting from it, which hardcoded hexes in the prompt did.
  const THEMES = {
    'vibeos-dark': {
      id: 'vibeos-dark',
      title: 'vibeOS dark',
      summary: 'The desktop’s own palette, inherited as CSS custom properties.',
      tokens: {
        '--bg': '#0a0a0c',
        '--panel': '#101219',
        '--panel2': '#0c0e14',
        '--line': '#23262f',
        '--line2': '#2a3244',
        '--text': '#f2f3f5',
        '--dim': '#8e93a0',
        '--dimmer': '#6b7181',
        '--accent': '#9db4ff',
        '--ok': '#4ade80',
        '--warn': '#fbbf24',
        '--no': '#f87171',
        '--bar': '#161a23',
        '--barline': '#262b38',
        '--btn': '#161922',
        '--btntext': '#c9d3e6',
        '--focus': '#3a4560',
        '--sel': '#1d2536',
        '--hover': '#171b26',
        '--title1': '#2b3146',
        '--title2': '#171b26',
        '--titletext': '#e8eaf0',
        '--pbtn': '#f2f3f5',
        '--pbtntext': '#0a0a0c',
        '--winbg': 'rgba(16,18,25,.97)',
        '--scroll': 'rgba(255,255,255,.14)',
        '--warnline': '#4a3a1a',
        '--up1': '#141a2e',
        '--up2': '#101219',
        '--upline': '#2c3550',
      },
      instructions: [
        'THEME — vibeOS dark.',
        'Your app mounts inside the desktop document, so these CSS custom properties are already inherited. Use them; do not hardcode hex values, or the app drifts when the desktop changes.',
        '  var(--text) body text        var(--dim) secondary        var(--dimmer) hints and labels',
        '  var(--panel2) app surface    var(--panel) raised surface  var(--bg) deepest',
        '  var(--line) hairlines        var(--line2) stronger edges  var(--accent) focus and selection',
        '  var(--ok) success            var(--warn) caution          var(--no) failure',
        'Shape and type: 8px radius on controls and inputs, 10-12px on panels and cards. 13px body, 11-12px for secondary text, 15px is the largest you should need. Padding 8-12px, gaps 6-10px.',
        'Monospace is font-family: "JetBrains Mono", ui-monospace, Menlo, monospace — use it for code, paths, numbers and IDs, not for prose.',
        'Interactive elements need a visible focus ring: outline 2px solid var(--accent) with 2px offset. Never remove focus styling without replacing it.',
        'No gradients, no drop shadows inside an app, no colour outside these tokens. The window frame already supplies depth.',
      ].join('\n'),
    },

    'vibeos-light': {
      id: 'vibeos-light',
      title: 'vibeOS light',
      summary: 'The same desktop, inverted. Same token names, so nothing needs rewriting.',
      tokens: {
        '--bg': '#eef0f4',
        '--panel': '#ffffff',
        '--panel2': '#f5f6fa',
        '--line': '#e2e5ec',
        '--line2': '#ccd2de',
        '--text': '#12151c',
        '--dim': '#5b6273',
        '--dimmer': '#868d9d',
        '--accent': '#3355dd',
        '--ok': '#15803d',
        '--warn': '#a16207',
        '--no': '#dc2626',
        '--bar': '#ffffff',
        '--barline': '#e2e5ec',
        '--btn': '#ffffff',
        '--btntext': '#12151c',
        '--focus': '#9aa6c4',
        '--sel': '#e4e9f7',
        '--hover': '#f0f2f7',
        '--title1': '#f7f8fb',
        '--title2': '#eef0f5',
        '--titletext': '#12151c',
        '--pbtn': '#1f2937',
        '--pbtntext': '#ffffff',
        '--winbg': 'rgba(255,255,255,.97)',
        '--scroll': 'rgba(0,0,0,.20)',
        '--warnline': '#e7cfa1',
        '--up1': '#eef2ff',
        '--up2': '#ffffff',
        '--upline': '#c7d2fe',
      },
      instructions: [
        'THEME — vibeOS light.',
        'Identical token names to the dark theme, different values. Use var(--text), var(--panel2), var(--line) and the rest exactly as before; never hardcode a hex, or your app stays dark when the desktop is light.',
        'Shape and type: 8px radius on controls and inputs, 10-12px on panels and cards. 13px body, 11-12px for secondary text, 15px is the largest you should need. Padding 8-12px, gaps 6-10px.',
        'Monospace is font-family: "JetBrains Mono", ui-monospace, Menlo, monospace — use it for code, paths, numbers and IDs, not for prose.',
        'Interactive elements need a visible focus ring: outline 2px solid var(--accent) with 2px offset. Never remove focus styling without replacing it.',
        'No gradients, no drop shadows inside an app, no colour outside these tokens. The window frame already supplies depth.',
      ].join('\n'),
    },
  };

  const SKILLS = {
    'os-design': {
      id: 'os-design',
      title: 'OS design',
      summary: 'How a small desktop app should behave, not just how it should look.',
      instructions: [
        'SKILL — OS design. These are behavioural rules for a desktop app in a small window. They outrank whatever the request implies about layout.',
        '',
        'Do one thing. An app that does one job well beats one with tabs for three. If the request implies several jobs, build the primary one and say what you left out rather than cramming.',
        '',
        'Respect the pane. It opens at roughly 430x320 and resizes. Everything must be usable at that size: no fixed pixel widths over 400, no more than about six controls visible at once, no layout that only works once the user enlarges the window.',
        '',
        'Show the important thing first. Put the primary action and the current state in the top third. Hide secondary controls behind a toggle or reveal them on demand — a dense wall of options slows every decision, including the common one.',
        '',
        'Every app has four states and you must design all four:',
        '  empty   — say what this app does and how to start, in one line. It must fit without scrolling.',
        '  loading — say what is happening, not just that something is. "reading workspace…" beats a spinner.',
        '  ready   — the actual content.',
        '  failed  — print the real error text. Never swallow an error, never substitute placeholder or example data for a failed read, never render an empty list where a failure happened. A visible error is correct; silently wrong content is not.',
        '',
        'Reduce what the user has to type or remember. Prefill sensible defaults, keep the last value where it makes sense, and let Enter submit the obvious action and Escape dismiss.',
        '',
        'Be reversible instead of asking. Prefer an undo over a confirmation dialog, and never open a browser alert(), confirm() or prompt() — they freeze the whole desktop, not just your app.',
        '',
        'Do not interrupt. No autofocus stealing, no timers that move content under the cursor, no polling faster than once a second.',
        '',
        'Label with nouns for things and verbs for actions. Lowercase sentence case, no exclamation marks, no marketing voice — this is a system tool.',
      ].join('\n'),
    },
  };

  const DEFAULT_SKILLS = ['os-design'];
  const DEFAULT_THEME = 'vibeos-dark';

  function getSkill(id) {
    const skill = SKILLS[id];
    if (!skill) throw new Error('unknown skill: ' + id);
    return skill;
  }

  function getTheme(id) {
    const theme = THEMES[id];
    if (!theme) throw new Error('unknown theme: ' + id);
    return theme;
  }

  /**
   * Append the installed theme and skills to a base prompt. Order matters:
   * the theme is a visual contract, the skills are behaviour, and behaviour
   * goes last so it is nearest the request.
   */
  function composePrompt(base, options) {
    const opts = options || {};
    const themeId = opts.theme === undefined ? DEFAULT_THEME : opts.theme;
    const skillIds = opts.skills === undefined ? DEFAULT_SKILLS : opts.skills;
    if (typeof base !== 'string' || !base) throw new Error('composePrompt needs a base prompt');

    const parts = [base];
    if (themeId) parts.push(getTheme(themeId).instructions);
    for (const id of skillIds) parts.push(getSkill(id).instructions);
    return parts.join('\n\n');
  }

  function installed() {
    return {
      theme: getTheme(DEFAULT_THEME),
      skills: DEFAULT_SKILLS.map(getSkill),
    };
  }

  return {
    SKILLS: SKILLS,
    THEMES: THEMES,
    DEFAULT_SKILLS: DEFAULT_SKILLS,
    DEFAULT_THEME: DEFAULT_THEME,
    getSkill: getSkill,
    getTheme: getTheme,
    composePrompt: composePrompt,
    installed: installed,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VibeOSSkills;
