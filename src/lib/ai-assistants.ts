// AI assistant and agent recognition for the AI traffic audit.
//
// Wider than the AI channel in channels.ts, on purpose: the audit's job is to
// show what that channel misses. Kept in step with supabase/audits/ai-traffic.sql.

const hostOf = (referrer: string | null): string | null => {
  if (!referrer) return null;
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(referrer);
  return m ? m[1].toLowerCase() : null;
};

const endsWithHost = (host: string, domains: string[]) =>
  domains.some((d) => host === d || host.endsWith(`.${d}`));

// Order matters: the first match wins.
const ASSISTANTS: { name: string; hosts?: string[]; exact?: string[]; utm?: RegExp }[] = [
  { name: "ChatGPT", hosts: ["chatgpt.com", "openai.com"], utm: /chatgpt|openai/i },
  { name: "Perplexity", hosts: ["perplexity.ai"], utm: /perplexity/i },
  { name: "Claude", hosts: ["claude.ai", "anthropic.com"], utm: /claude/i },
  { name: "Gemini", exact: ["gemini.google.com", "bard.google.com"], utm: /gemini/i },
  { name: "Copilot", exact: ["copilot.microsoft.com", "copilot.cloud.microsoft"], utm: /copilot/i },
  { name: "Grok", hosts: ["grok.com", "x.ai"], utm: /grok/i },
  { name: "DeepSeek", hosts: ["deepseek.com"], utm: /deepseek/i },
  { name: "Meta AI", hosts: ["meta.ai"] },
  { name: "Mistral", hosts: ["mistral.ai"] },
  { name: "You.com", hosts: ["you.com"] },
  { name: "Phind", hosts: ["phind.com"] },
  { name: "Poe", hosts: ["poe.com"] },
];

/** The AI assistant a visit came from, by referrer host or utm_source, or null. */
export function assistantOf(referrer: string | null, utmSource: string | null): string | null {
  const host = hostOf(referrer);
  for (const a of ASSISTANTS) {
    if (host && a.hosts && endsWithHost(host, a.hosts)) return a.name;
    if (host && a.exact?.includes(host)) return a.name;
    if (utmSource && a.utm?.test(utmSource)) return a.name;
  }
  if ((host && host.includes("minara")) || (utmSource && /minara/i.test(utmSource))) return "Minara";
  return null;
}

/** True when the referrer host belongs to a known assistant. */
export function isAssistantHost(referrer: string | null): boolean {
  return assistantOf(referrer, null) !== null;
}

export { hostOf as referrerHost };

// Order matters: the more specific token first (ChatGPT-User before GPTBot).
const AGENTS: [RegExp, string][] = [
  [/ChatGPT-User/i, "ChatGPT-User (answer-time fetch)"],
  [/OAI-SearchBot/i, "OAI-SearchBot"],
  [/GPTBot/i, "GPTBot (training)"],
  [/Perplexity-User/i, "Perplexity-User"],
  [/PerplexityBot/i, "PerplexityBot"],
  [/Claude-User/i, "Claude-User"],
  [/Claude-SearchBot/i, "Claude-SearchBot"],
  [/ClaudeBot|anthropic/i, "ClaudeBot"],
  [/MistralAI-User/i, "MistralAI-User"],
  [/DuckAssistBot/i, "DuckAssistBot"],
  [/meta-externalagent|meta-externalfetcher/i, "Meta AI agent"],
  [/Bytespider/i, "Bytespider"],
  [/CCBot/i, "CCBot"],
  [/Amazonbot/i, "Amazonbot"],
  [/Applebot/i, "Applebot"],
  [/Googlebot|Google-InspectionTool/i, "Googlebot"],
  [/bingbot/i, "Bingbot"],
  [/HeadlessChrome/i, "HeadlessChrome (unnamed automation)"],
];

/** A named AI agent or crawler from a user agent, or null. */
export function agentOf(userAgent: string | null): string | null {
  if (!userAgent) return null;
  for (const [re, name] of AGENTS) if (re.test(userAgent)) return name;
  return null;
}
