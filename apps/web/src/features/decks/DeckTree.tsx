import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DropdownMenu } from 'radix-ui';
import { ChevronDown, ChevronRight, MoreVertical } from 'lucide-react';
import type { Deck } from '@mnemo/core';
import { deckLabel } from '@mnemo/core';
import type { DeckTreeEntry } from '@mnemo/services';
import { Button, focusRing } from '../../components/ui/Button';

export type DeckAction = 'add' | 'rename' | 'options' | 'custom' | 'stats' | 'export' | 'delete';

const COLLAPSED_KEY = 'mnemo.collapsedDecks';

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function Count({ value, tone, label }: { value: number; tone: string; label: string }) {
  return (
    <span
      className={`w-10 text-right tabular-nums ${value ? tone : 'text-slate-400 dark:text-slate-600'}`}
      title={label}
    >
      <span className="sr-only">{label} : </span>
      {value}
    </span>
  );
}

interface RowProps {
  entry: DeckTreeEntry;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  onAction: (action: DeckAction, deck: Deck) => void;
  filter: (entry: DeckTreeEntry) => boolean;
}

function DeckRow({ entry, collapsed, toggle, onAction, filter }: RowProps) {
  const { t } = useTranslation();
  const { deck } = entry.node;
  const isCollapsed = collapsed.has(deck.id);
  const children = entry.children.filter(filter);
  const { counts } = entry;
  const total = counts.new + counts.learning + counts.review;
  const menuItem =
    'cursor-pointer rounded px-3 py-2 outline-none data-[highlighted]:bg-indigo-50 dark:data-[highlighted]:bg-indigo-950';
  return (
    <li>
      <div
        className="flex items-center gap-2 border-b border-slate-200 py-2 dark:border-slate-800"
        style={{ paddingLeft: `${String(entry.node.depth * 1.25)}rem` }}
      >
        {entry.children.length > 0 ? (
          <button
            type="button"
            className={`rounded p-1 ${focusRing}`}
            aria-expanded={!isCollapsed}
            aria-label={
              isCollapsed
                ? t('decks.expand', { name: deckLabel(deck) })
                : t('decks.collapse', { name: deckLabel(deck) })
            }
            onClick={() => {
              toggle(deck.id);
            }}
          >
            {isCollapsed ? (
              <ChevronRight aria-hidden size={18} />
            ) : (
              <ChevronDown aria-hidden size={18} />
            )}
          </button>
        ) : (
          <span className="w-7" />
        )}
        <Link
          to={`/study/${deck.id}`}
          className={`min-w-0 flex-1 truncate rounded font-medium hover:underline ${focusRing}`}
        >
          {deckLabel(deck)}
        </Link>
        <span className="flex text-sm font-semibold">
          <Count
            value={counts.new}
            tone="text-blue-700 dark:text-blue-300"
            label={t('decks.new')}
          />
          <Count
            value={counts.learning}
            tone="text-orange-700 dark:text-orange-300"
            label={t('decks.learning')}
          />
          <Count
            value={counts.review}
            tone="text-emerald-700 dark:text-emerald-300"
            label={t('decks.review')}
          />
        </span>
        <Link
          to={`/study/${deck.id}`}
          className={`hidden rounded-lg px-3 py-1.5 text-sm font-medium sm:inline-block ${total ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-slate-300 dark:border-slate-600'} ${focusRing}`}
        >
          {t('decks.study')}
        </Link>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('decks.actions', { name: deckLabel(deck) })}
            >
              <MoreVertical aria-hidden size={18} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-50 min-w-48 rounded-lg border border-slate-200 bg-white p-1 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {(['add', 'custom', 'options', 'rename', 'stats', 'export', 'delete'] as const).map(
                (action) => (
                  <DropdownMenu.Item
                    key={action}
                    className={`${menuItem} ${action === 'delete' ? 'text-red-700 dark:text-red-400' : ''}`}
                    onSelect={() => {
                      onAction(action, deck);
                    }}
                  >
                    {t(`decks.action.${action}`)}
                  </DropdownMenu.Item>
                ),
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {!isCollapsed && children.length > 0 && (
        <ul>
          {children.map((c) => (
            <DeckRow
              key={c.node.deck.id}
              entry={c}
              collapsed={collapsed}
              toggle={toggle}
              onAction={onAction}
              filter={filter}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Collapsible deck tree with today's counts. Search keeps matching decks and their ancestors. */
export function DeckTree({
  entries,
  search,
  onAction,
}: {
  entries: DeckTreeEntry[];
  search: string;
  onAction: RowProps['onAction'];
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const q = fold(search.trim());
  const matches = (e: DeckTreeEntry): boolean =>
    !q || fold(e.node.deck.name).includes(q) || e.children.some(matches);
  const toggle = (id: string) => {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Preference only.
      }
      return next;
    });
  };
  const visible = entries.filter(matches);
  return (
    <div>
      <div
        className="flex justify-end gap-2 border-b border-slate-300 pb-1 text-xs font-semibold text-slate-600 sm:pr-36 dark:border-slate-700 dark:text-slate-400"
        aria-hidden
      >
        <span className="w-10 text-right">{t('decks.newShort')}</span>
        <span className="w-10 text-right">{t('decks.learningShort')}</span>
        <span className="w-10 text-right">{t('decks.reviewShort')}</span>
      </div>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-slate-600 dark:text-slate-400">{t('decks.noMatch')}</p>
      ) : (
        <ul aria-label={t('decks.listLabel')}>
          {visible.map((e) => (
            <DeckRow
              key={e.node.deck.id}
              entry={e}
              collapsed={q ? new Set() : collapsed}
              toggle={toggle}
              onAction={onAction}
              filter={matches}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
