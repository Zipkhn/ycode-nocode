import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const THEME_PATH = path.join(process.cwd(), 'public', 'global-theme.css');
const APP_THEME_PATH = path.join(process.cwd(), 'app', 'global-theme.css');

const CUSTOM_VARS_START = '/* STUDIO_CUSTOM_VARS_START */';
const CUSTOM_VARS_END   = '/* STUDIO_CUSTOM_VARS_END */';

export interface CustomMode {
  id: string;
  name: string;
  selector: string;
}

export interface CustomVariable {
  id: string;
  name: string;
  type: 'color' | 'size' | 'text';
  values: Record<string, string>; // modeId -> value
}

export interface CustomVarsConfig {
  modes: CustomMode[];
  variables: CustomVariable[];
}

const DEFAULT_CONFIG: CustomVarsConfig = {
  modes: [{ id: 'default', name: 'Default', selector: ':root' }],
  variables: [],
};

function parseCustomVarsConfig(css: string): CustomVarsConfig {
  const start = css.indexOf(CUSTOM_VARS_START);
  const end   = css.indexOf(CUSTOM_VARS_END);
  if (start === -1 || end === -1) return DEFAULT_CONFIG;

  const block = css.substring(start, end);
  const match = block.match(/\/\* CONFIG: (.+) \*\//);
  if (!match) return DEFAULT_CONFIG;

  try {
    return JSON.parse(match[1]) as CustomVarsConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function generateCustomVarsCSS(config: CustomVarsConfig): string {
  if (!config.variables.length) return '';

  const lines: string[] = [];
  for (const mode of config.modes) {
    const vars = config.variables
      .map(v => {
        const val = v.values[mode.id] ?? '';
        if (!val) return null;
        return `  --custom--${v.name}: ${val};`;
      })
      .filter(Boolean);
    if (!vars.length) continue;
    lines.push(`${mode.selector} {`);
    lines.push(...(vars as string[]));
    lines.push('}');
  }
  return lines.join('\n');
}

function buildCustomVarsBlock(config: CustomVarsConfig): string {
  const configJson = JSON.stringify(config);
  const css = generateCustomVarsCSS(config);
  return `${CUSTOM_VARS_START}\n/* CONFIG: ${configJson} */\n${css ? css + '\n' : ''}${CUSTOM_VARS_END}`;
}

function writeCustomVarsBlock(css: string, config: CustomVarsConfig): string {
  const block = buildCustomVarsBlock(config);
  if (css.includes(CUSTOM_VARS_START) && css.includes(CUSTOM_VARS_END)) {
    const start = css.indexOf(CUSTOM_VARS_START);
    const end   = css.indexOf(CUSTOM_VARS_END) + CUSTOM_VARS_END.length;
    return css.substring(0, start) + block + css.substring(end);
  }
  // Fallback: insert before STUDIO_RUNTIME_BRIDGES_START
  return css.replace('/* STUDIO_RUNTIME_BRIDGES_START */', `${block}\n\n/* STUDIO_RUNTIME_BRIDGES_START */`);
}

export async function GET() {
  try {
    const css = await fs.readFile(THEME_PATH, 'utf-8');
    const startIdx = css.indexOf('/* STUDIO_CORE_START */');
    const endIdx   = css.indexOf('/* STUDIO_CORE_END */');

    if (startIdx === -1 || endIdx === -1) {
      return NextResponse.json({ error: 'Studio core section not found' }, { status: 404 });
    }

    const coreSection = css.substring(startIdx, endIdx);
    const variables: Record<string, string> = {};
    const regex = /--([a-zA-Z0-9_-]+):\s*([^;]+);/g;
    let match;
    while ((match = regex.exec(coreSection)) !== null) {
      variables[match[1]] = match[2];
    }

    const customVarsConfig = parseCustomVarsConfig(css);

    return NextResponse.json({ variables, customVarsConfig });
  } catch {
    return NextResponse.json({ error: 'Failed to read theme file' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { updates, bridges, customVarsConfig } = await request.json();

    let css = await fs.readFile(THEME_PATH, 'utf-8');

    // 1. Apply variable updates
    if (updates && typeof updates === 'object') {
      for (const [key, value] of Object.entries(updates)) {
        if (value === '__remove__') {
          css = css.replace(new RegExp(`\\s*--${key}:[^;]+;`, 'g'), '');
        } else if (new RegExp(`--${key}:`).test(css)) {
          css = css.replace(new RegExp(`(--${key}:\\s*)([^;]+)(;)`, 'g'), `$1${value}$3`);
        } else {
          if (css.includes('/* STUDIO_THEME_END */')) {
            css = css.replace('/* STUDIO_THEME_END */', `  --${key}: ${value};\n/* STUDIO_THEME_END */`);
          } else {
            css = css.replace('/* STUDIO_CORE_END */', `:root {\n  --${key}: ${value};\n}\n/* STUDIO_CORE_END */`);
          }
        }
      }
    }

    // 2. Write custom vars block
    if (customVarsConfig) {
      css = writeCustomVarsBlock(css, customVarsConfig as CustomVarsConfig);
    }

    // 3. Inject Bridge CSS
    if (bridges && typeof bridges === 'string') {
      const bridgeStart = '/* STUDIO_RUNTIME_BRIDGES_START */';
      const bridgeEnd   = '/* STUDIO_RUNTIME_BRIDGES_END */';

      let finalBridges = bridges;
      if (!bridges.includes('Studio Theme Dark Bridge')) {
        const existingMatch = css.match(
          /\/\* STUDIO_RUNTIME_BRIDGES_START \*\/([\s\S]*?)\/\* STUDIO_RUNTIME_BRIDGES_END \*\//
        );
        if (existingMatch) {
          const themeDarkMatch = existingMatch[1].match(
            /\/\* Studio Theme Dark Bridge \*\/[\s\S]*?\.u-theme-dark\s*\{[\s\S]*?\}/
          );
          if (themeDarkMatch) finalBridges = bridges + '\n\n' + themeDarkMatch[0];
        }
      }

      const bridgeBlock = `${bridgeStart}\n${finalBridges}\n${bridgeEnd}`;
      if (css.includes(bridgeStart) && css.includes(bridgeEnd)) {
        const startIdx = css.indexOf(bridgeStart);
        const endIdx   = css.indexOf(bridgeEnd) + bridgeEnd.length;
        css = css.substring(0, startIdx).trimEnd() + '\n\n' + bridgeBlock + '\n';
      } else {
        css = css.trimEnd() + '\n\n' + bridgeBlock + '\n';
      }
    }

    // Safety check
    if (!css.includes('/* STUDIO_CORE_START */') || !css.includes('/* STUDIO_CORE_END */')) {
      return NextResponse.json({ error: 'STUDIO_CORE integrity check failed — write aborted' }, { status: 500 });
    }

    const original = await fs.readFile(THEME_PATH, 'utf-8');
    if (css !== original) {
      await fs.writeFile(THEME_PATH, css, 'utf-8');
      try { await fs.writeFile(APP_THEME_PATH, css, 'utf-8'); } catch { /* ok */ }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update theme file' }, { status: 500 });
  }
}
