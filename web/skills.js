/**
 * Skills for the vibeOS agent.
 *
 * A *skill* is reusable know-how appended to the system prompt. They live
 * here rather than inside a prompt string because there are two prompt paths
 * — the Codex route on the server and the paste-key path in the browser — and
 * a design rule that only reaches one of them is worse than no rule at all.
 * Themes are not here: a theme is a [data-theme] block in os.css.
 *
 * Loaded as a browser global (<script src="/app/skills.js">) and imported by
 * lib/system-prompt.ts on the server. Plain JS, no bundler.
 */
var VibeOSSkills = (function () {
  const SKILLS = {
    // The desktop's tokens are custom properties on :root in os.css (and in
    // every [data-theme] block, same names). Apps mount inside that document,
    // so the properties are already inherited — a generated app referencing
    // var(--text) tracks whichever theme is on, which hardcoded hexes in the
    // prompt did not. One contract, theme-agnostic: the names never change.
    'desktop-tokens': {
      id: 'desktop-tokens',
      title: 'Desktop tokens',
      summary: 'The desktop’s palette and shape as CSS custom properties, inherited by every app whatever theme is on.',
      instructions: [
        'TOKENS — the desktop’s look.',
        'Your app mounts inside the desktop document, so these CSS custom properties are already inherited. Use them; do not hardcode hex values, or the app drifts when the desktop changes theme.',
        '  var(--text) body text        var(--dim) secondary        var(--dimmer) hints and labels',
        '  var(--panel2) app surface    var(--panel) raised surface  var(--bg) deepest',
        '  var(--line) hairlines        var(--line2) stronger edges  var(--accent) focus and selection',
        '  var(--ok) success            var(--warn) caution          var(--no) failure',
        'Shape and type: var(--radius-ctl) on controls and inputs, var(--radius-win) on panels and cards, var(--font-ui) for text and var(--font-mono) for code, paths, numbers and IDs — not for prose. 13px body, 11-12px for secondary text, 15px is the largest you should need. Padding 8-12px, gaps 6-10px.',
        'Interactive elements need a visible focus ring: outline 2px solid var(--accent) with 2px offset. Never remove focus styling without replacing it.',
        'No gradients, no drop shadows inside an app, no colour outside these tokens. The window frame already supplies depth.',
      ].join('\n'),
    },

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

  const DEFAULT_SKILLS = ['desktop-tokens', 'os-design'];

  function getSkill(id) {
    const skill = SKILLS[id];
    if (!skill) throw new Error('unknown skill: ' + id);
    return skill;
  }

  /**
   * Append the installed skills to a base prompt. Order matters: the tokens
   * are a visual contract, os-design is behaviour, and behaviour goes last so
   * it is nearest the request.
   */
  function composePrompt(base, options) {
    const opts = options || {};
    const skillIds = opts.skills === undefined ? DEFAULT_SKILLS : opts.skills;
    if (typeof base !== 'string' || !base) throw new Error('composePrompt needs a base prompt');

    const parts = [base];
    for (const id of skillIds) parts.push(getSkill(id).instructions);
    return parts.join('\n\n');
  }

  function installed() {
    return { skills: DEFAULT_SKILLS.map(getSkill) };
  }

  return {
    SKILLS: SKILLS,
    DEFAULT_SKILLS: DEFAULT_SKILLS,
    getSkill: getSkill,
    composePrompt: composePrompt,
    installed: installed,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VibeOSSkills;
