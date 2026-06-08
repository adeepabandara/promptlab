import { PromptParameter } from '@/types';

export function replaceVariables(
  template: string,
  params: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
}

export function detectVariables(template: string): string[] {
  const allMatches: string[] = [];
  const regex = /\{\{(\w+)\}\}/g;
  let match;
  while ((match = regex.exec(template)) !== null) {
    allMatches.push(match[1]);
  }
  return allMatches.filter((v, i, arr) => arr.indexOf(v) === i);
}

export function validateParams(
  params: PromptParameter[],
  values: Record<string, string>
): { valid: boolean; missing: string[] } {
  const missing = params
    .filter((p) => p.required && !values[p.name])
    .map((p) => p.name);
  return { valid: missing.length === 0, missing };
}

export function extractJson(text: string): Record<string, unknown> | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1].trim() : text.trim();

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
