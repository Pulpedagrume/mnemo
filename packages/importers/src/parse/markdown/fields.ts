import type { I18nString } from '@mnemo/core';
import type { IssueCode } from '../../report';
import { t } from '../issue';
import { foldName } from '../text';
import { CodeTracker } from './code';
import {
  ARROW,
  BOOLEAN_WORDS,
  BULLET,
  CHECKBOX,
  COMMON_GROUPS,
  FIELD_GROUPS,
  FIELD_LINE,
  LIST_TYPES,
  NUMBERED,
  keyFor,
  type Group,
} from './names';

/** Reports an issue at a line of the block (the caller adds note index, uid, excerpt). */
export type BlockReport = (
  kind: 'fix' | 'warn' | 'error',
  code: IssueCode,
  message: I18nString,
  howToFix: I18nString,
  line: number,
  path?: string,
) => void;

interface OpenField {
  key: string;
  group: Group | 'custom';
  lines: string[];
  line: number;
}

/** Mutable state of a block body being read. */
class BodyReader {
  readonly note: Record<string, unknown> = {};
  readonly fields: Record<string, string> = {};
  private current: OpenField | undefined;
  private listMode = false;
  private lastItem: { list: unknown[]; index: number } | undefined;
  private bulletWarned = false;
  private readonly code = new CodeTracker();
  private readonly items: unknown[] = [];
  private readonly distractors: string[] = [];

  constructor(
    private readonly type: string,
    private readonly custom: boolean,
    private readonly report: BlockReport,
  ) {}

  read(lines: readonly string[], firstLine: number): Record<string, unknown> {
    lines.forEach((line, i) => {
      this.line(line, firstLine + i);
    });
    this.close();
    this.finishItems();
    if (this.custom) this.note.fields = this.fields;
    return this.note;
  }

  private line(raw: string, lineNo: number): void {
    if (this.code.inside() || this.code.opens(raw)) {
      this.code.feed(raw);
      this.append(raw, lineNo);
      return;
    }
    const field = FIELD_LINE.exec(raw);
    const name = field?.[1];
    if (field && name !== undefined) {
      const group = FIELD_GROUPS[foldName(name)];
      if (group !== undefined || (this.custom && !/^https?$/i.test(name))) {
        if ((field[2] ?? '') !== '')
          this.spacing(
            lineNo,
            t(`espace avant « : » après « ${name} »`, `space before ":" after "${name}"`),
          );
        this.open(group, name, field[3] ?? '', lineNo);
        return;
      }
    }
    if (this.structural()) {
      const item = BULLET.exec(raw) ?? NUMBERED.exec(raw);
      if (item) {
        this.item(item, lineNo);
        return;
      }
      if (this.listMode && this.lastItem && /^\s{2,}\S/.test(raw)) {
        const { list, index } = this.lastItem;
        const prev = list[index];
        if (typeof prev === 'string') list[index] = `${prev}\n${raw.trim()}`;
        else if (prev !== null && typeof prev === 'object' && 'text' in prev) {
          (prev as { text: string }).text += `\n${raw.trim()}`;
        }
        return;
      }
    }
    this.append(raw, lineNo);
  }

  /** List items are structure when no field is open, or after the question/distractors label. */
  private structural(): boolean {
    if (!LIST_TYPES.has(this.type)) return false;
    if (this.current === undefined) return true;
    return this.current.group === 'front' || this.current.group === 'distractors';
  }

  private spacing(line: number, what: I18nString): void {
    this.report(
      'fix',
      'markdown_spacing_fixed',
      t(`Mise en forme Markdown corrigée : ${what.fr}.`, `Markdown layout fixed: ${what.en}.`),
      t(
        'Respectez la syntaxe « Nom: valeur », « ::: type » et les puces « - ».',
        'Follow the "Name: value", "::: type" and "- " bullet syntax.',
      ),
      line,
    );
  }

  private open(group: Group | undefined, name: string, rest: string, line: number): void {
    this.close();
    this.listMode = false;
    if (group === undefined) {
      this.current = { key: name, group: 'custom', lines: [rest], line };
      return;
    }
    const key = this.custom && !COMMON_GROUPS.has(group) ? name : keyFor(this.type, group);
    this.current = {
      key,
      group: this.custom && !COMMON_GROUPS.has(group) ? 'custom' : group,
      lines: [rest],
      line,
    };
    if (group === 'distractors') this.listMode = true;
  }

  private append(raw: string, line: number): void {
    if (this.current) {
      this.current.lines.push(raw);
      return;
    }
    if (raw.trim() === '') return;
    this.report(
      'warn',
      'unknown_field',
      t(
        `Texte hors champ ignoré : « ${raw.trim().slice(0, 80)} ».`,
        `Text outside any field ignored: "${raw.trim().slice(0, 80)}".`,
      ),
      t(
        'Placez ce texte dans un champ (Q:, A:, Text:, Explanation:…) ou supprimez-le.',
        'Put this text in a field (Q:, A:, Text:, Explanation:…) or remove it.',
      ),
      line,
    );
  }

  private close(): void {
    const cur = this.current;
    this.current = undefined;
    if (!cur) return;
    const value = cur.lines.join('\n').trim();
    if (cur.group === 'distractors') {
      if (value !== '')
        this.distractors.push(
          ...value
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s !== ''),
        );
      return;
    }
    if (cur.group === 'custom') {
      this.fields[cur.key] = value;
      return;
    }
    this.setValue(cur, value);
  }

  private setValue(cur: OpenField, value: string): void {
    const note = this.note;
    const key = cur.key;
    if (cur.group === 'hint') {
      note.hint = [...(Array.isArray(note.hint) ? (note.hint as string[]) : []), value];
      return;
    }
    if (key === 'answer' && this.type === 'typed') {
      const variants = value.split(' | ').map((s) => s.trim());
      note.answer = [...(Array.isArray(note.answer) ? (note.answer as string[]) : []), ...variants];
      return;
    }
    let parsed: unknown = value;
    if (key === 'answer' && this.type === 'truefalse')
      parsed = BOOLEAN_WORDS[foldName(value)] ?? value;
    else if (key === 'difficulty' && /^\d+$/.test(value)) parsed = Number(value);
    else if (key === 'source' && value.startsWith('{')) parsed = parseJsonObject(value) ?? value;
    if (key in note) {
      this.report(
        'warn',
        'invalid_value',
        t(
          `Champ « ${key} » répété : valeurs mises bout à bout.`,
          `Field "${key}" repeated: values joined.`,
        ),
        t('N’écrivez chaque champ qu’une fois par bloc.', 'Write each field only once per block.'),
        cur.line,
        key,
      );
      note[key] = `${String(note[key])}\n\n${value}`;
      return;
    }
    note[key] = parsed;
  }

  private item(m: RegExpExecArray, line: number): void {
    if (this.current?.group === 'front') this.close();
    this.listMode = true;
    const marker = m[1] ?? '-';
    const text = (m[2] ?? '').trim();
    if ((marker === '*' || marker === '+') && !this.bulletWarned) {
      this.bulletWarned = true;
      this.spacing(line, t(`puce « ${marker} » lue comme « - »`, `"${marker}" bullet read as "-"`));
    }
    if (this.current?.group === 'distractors') {
      this.distractors.push(text);
      this.lastItem = { list: this.distractors, index: this.distractors.length - 1 };
      return;
    }
    this.items.push(this.toItem(text, line));
    this.lastItem = { list: this.items, index: this.items.length - 1 };
  }

  private toItem(text: string, line: number): unknown {
    if (this.type === 'mcq') {
      const box = CHECKBOX.exec(text);
      if (box) return { text: (box[2] ?? '').trim(), correct: box[1] !== ' ' };
      this.spacing(
        line,
        t(
          'proposition sans case « [ ] » lue comme fausse',
          'choice without "[ ]" box read as incorrect',
        ),
      );
      return { text, correct: false };
    }
    if (this.type === 'matching') {
      const arrow = ARROW.exec(text);
      if (!arrow) {
        this.report(
          'error',
          'invalid_value',
          t(`Paire sans « => » : « ${text} ».`, `Pair without "=>": "${text}".`),
          t(
            'Écrivez « - gauche => droite » (les leurres vont dans un champ Distractors:).',
            'Write "- left => right" (distractors go in a Distractors: field).',
          ),
          line,
          'pairs',
        );
        return { left: text, right: '' };
      }
      if (arrow[1] !== '=>')
        this.spacing(
          line,
          t(
            `flèche « ${arrow[1] ?? ''} » lue comme « => »`,
            `arrow "${arrow[1] ?? ''}" read as "=>"`,
          ),
        );
      return {
        left: text.slice(0, arrow.index).trim(),
        right: text.slice(arrow.index + arrow[0].length).trim(),
      };
    }
    return text;
  }

  private finishItems(): void {
    const items = this.items;
    if (this.distractors.length > 0) this.note.distractors = this.distractors;
    if (items.length === 0) return;
    const key = { mcq: 'choices', matching: 'pairs', ordering: 'steps', list: 'items' }[this.type];
    if (key !== undefined) this.note[key] = items;
  }
}

function parseJsonObject(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Reads the body of a `::: type` block into a canonical note object (without type and
 * attributes). `type` is the canonical type (aliases already resolved for field mapping).
 */
export function parseBlockBody(
  type: string,
  lines: readonly string[],
  firstLine: number,
  report: BlockReport,
): Record<string, unknown> {
  return new BodyReader(type, type.startsWith('custom:'), report).read(lines, firstLine);
}
