#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadEnvFile(resolve(process.cwd(), '.env.local'));

const token = process.argv[2]?.trim();
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!token) {
  exitWithError('Usage: node scripts/read-codex-export.mjs <CODEX_EXPORT_CODE>');
}

if (!supabaseUrl || !publishableKey) {
  exitWithError('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
}

const response = await fetch(`${supabaseUrl}/rest/v1/rpc/read_codex_export`, {
  body: JSON.stringify({ token_input: token }),
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${publishableKey}`,
    'Content-Type': 'application/json',
  },
  method: 'POST',
});

if (!response.ok) {
  const errorText = await response.text();
  exitWithError(`Codex export read failed (${response.status}): ${errorText}`);
}

const payload = await response.json();
console.log(formatExport(payload));

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function formatExport(payload) {
  const city = payload.city ?? {};
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const groups = {
    idea: entries.filter((entry) => entry.kind === 'idea'),
    guide: entries.filter((entry) => entry.kind === 'guide'),
    plan: entries.filter((entry) => entry.kind === 'plan'),
    memory: entries.filter((entry) => entry.kind === 'memory'),
  };

  return [
    `# ${city.title ?? 'Tripmates city'} Codex export`,
    '',
    `Destination: ${city.destination ?? ''}`,
    `Date range: ${city.date_range ?? ''}`,
    `Members: ${(city.member_names ?? []).join(', ')}`,
    `Export expires: ${payload.export?.expires_at ?? ''}`,
    '',
    ...formatGroup('Ideas', groups.idea),
    ...formatGroup('Guides', groups.guide),
    ...formatGroup('Plans', groups.plan),
    ...formatGroup('Memories', groups.memory),
  ].join('\n');
}

function formatGroup(label, entries) {
  if (!entries.length) {
    return [`## ${label}`, '', 'No entries.', ''];
  }

  return [
    `## ${label}`,
    '',
    ...entries.flatMap((entry) => [
      `### ${entry.title}`,
      `Tag: ${entry.tag ?? ''}`,
      `Author: ${entry.author_name ?? ''}`,
      `Meta: ${entry.meta ?? ''}`,
      entry.source_url ? `Source: ${entry.source_url}` : '',
      entry.ai_summary ? `Summary: ${entry.ai_summary}` : '',
      '',
      entry.note ?? '',
      '',
    ]),
  ];
}

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}
