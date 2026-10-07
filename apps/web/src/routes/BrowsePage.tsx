import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Note } from '@mnemo/core';
import { getField, primaryFieldKey, resolveLocale, stripCloze } from '@mnemo/core';
import {
  bulkUpdateNotes,
  deleteNotes,
  listDecks,
  listNoteTypes,
  setNotesSuspended,
} from '@mnemo/services';
import { useMutation, useQuery } from '../app/services';
import { errorMessage } from '../app/errors';
import { PageTitle } from '../components/PageTitle';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { inputClass } from '../components/ui/Field';
import { toast } from '../components/ui/Toaster';
import { noteTypeLabel } from '../features/editor/NoteEditor';
import {
  BrowseFilters,
  EMPTY,
  LIMIT,
  toSearch,
  type Filters,
} from '../features/browse/BrowseFilters';
import { encodeCustom } from '../features/study/customStudy';
import { NoteEditForm } from '../features/editor/NoteEditForm';

export function BrowsePage() {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /** Wide screens edit in a side panel; small screens open the full editor page. */
  const openNote = (id: string) => {
    if (window.matchMedia('(min-width: 1024px)').matches) setEditing(id);
    else void navigate(`/notes/${id}`);
  };
  const meta = useQuery(async (ctx) => {
    const [decks, noteTypes, tags] = await Promise.all([
      listDecks(ctx),
      listNoteTypes(ctx),
      ctx.repo.notes.tagCounts(),
    ]);
    return { decks: decks.sort((a, b) => a.name.localeCompare(b.name)), noteTypes, tags };
  }, []);
  const decks = useMemo(() => meta.data?.decks ?? [], [meta.data]);
  const subtree = (id: string) => {
    const root = decks.find((d) => d.id === id);
    return root
      ? decks.filter((d) => d.id === id || d.name.startsWith(`${root.name}::`)).map((d) => d.id)
      : [id];
  };
  const results = useQuery(
    (ctx) => ctx.repo.notes.search(toSearch(filters, subtree)),
    [JSON.stringify(filters), decks.length],
  );
  const bulk = useMutation(async (ctx, fn: (c: typeof ctx) => Promise<unknown>) => fn(ctx));
  const notes = results.data?.notes ?? [];
  const noteTypes = useMemo(
    () => new Map((meta.data?.noteTypes ?? []).map((n) => [n.id, n] as const)),
    [meta.data],
  );
  const deckNames = useMemo(() => new Map(decks.map((d) => [d.id, d.name] as const)), [decks]);

  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual; no React Compiler here
  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setSelected(new Set());
  };
  const ids = [...selected];
  const runBulk = (fn: Parameters<typeof bulk>[0], message: string) => {
    bulk(fn).then(
      () => {
        toast(message, 'success');
      },
      (e: unknown) => {
        toast(errorMessage(e, t), 'error');
      },
    );
  };
  const preview = (n: Note) => {
    const nt = noteTypes.get(n.noteTypeId);
    const text = nt ? getField(n.fields, primaryFieldKey(nt)) : (Object.values(n.fields)[0] ?? '');
    return stripCloze(text).replace(/\s+/g, ' ').slice(0, 160);
  };
  const toggle = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <PageTitle title={t('browse.title')} />
      <BrowseFilters
        filters={filters}
        set={set}
        decks={decks}
        tags={meta.data?.tags ?? []}
        noteTypes={meta.data?.noteTypes ?? []}
        locale={locale}
      />

      <div
        className="mb-2 flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label={t('browse.bulkActions')}
      >
        <span className="text-sm text-slate-700 dark:text-slate-300" aria-live="polite">
          {results.data
            ? t('browse.count', { count: results.data.total, selected: selected.size })
            : t('common.loading')}
        </span>
        <Button
          size="sm"
          onClick={() => {
            setSelected(
              selected.size === notes.length ? new Set() : new Set(notes.map((n) => n.id)),
            );
          }}
        >
          {selected.size === notes.length && notes.length > 0
            ? t('browse.selectNone')
            : t('browse.selectAll')}
        </Button>
        {selected.size > 0 && (
          <>
            <select
              aria-label={t('browse.moveTo')}
              className={`${inputClass} w-auto py-1 text-sm`}
              value=""
              onChange={(e) => {
                const deckId = e.target.value;
                if (deckId)
                  runBulk(
                    (ctx) => bulkUpdateNotes(ctx, ids, { kind: 'move', deckId }),
                    t('browse.moved'),
                  );
              }}
            >
              <option value="">{t('browse.moveTo')}</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() => {
                const tag = window.prompt(t('browse.addTagPrompt'));
                if (tag?.trim())
                  runBulk(
                    (ctx) =>
                      bulkUpdateNotes(ctx, ids, { kind: 'addTags', tags: tag.split(/[\s,]+/) }),
                    t('browse.tagged'),
                  );
              }}
            >
              {t('browse.addTag')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const tag = window.prompt(t('browse.removeTagPrompt'));
                if (tag?.trim())
                  runBulk(
                    (ctx) =>
                      bulkUpdateNotes(ctx, ids, { kind: 'removeTags', tags: tag.split(/[\s,]+/) }),
                    t('browse.untagged'),
                  );
              }}
            >
              {t('browse.removeTag')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                runBulk((ctx) => setNotesSuspended(ctx, ids, true), t('browse.suspended'));
              }}
            >
              {t('browse.suspend')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                runBulk((ctx) => setNotesSuspended(ctx, ids, false), t('browse.unsuspended'));
              }}
            >
              {t('browse.unsuspend')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void (async () => {
                  const cards = await bulk((ctx) => ctx.repo.cards.byNote(ids));
                  const root = (cards as { deckId: string; id: string }[])[0]?.deckId ?? '';
                  void navigate(
                    `/study/${root}?${encodeCustom({ kind: 'selection', cardIds: (cards as { id: string }[]).map((c) => c.id) })}`,
                  );
                })();
              }}
            >
              {t('browse.study')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        )}
      </div>

      <div className={editing ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_32rem]' : ''}>
        <div
          ref={parentRef}
          className="h-[65dvh] overflow-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          {notes.length === 0 && results.status === 'success' ? (
            <p className="p-6 text-center text-slate-600 dark:text-slate-400">
              {t('browse.empty')}
            </p>
          ) : (
            <ul
              aria-label={t('browse.results')}
              style={{ height: `${String(virtualizer.getTotalSize())}px` }}
              className="relative"
            >
              {virtualizer.getVirtualItems().map((row) => {
                const n = notes[row.index];
                if (!n) return null;
                const nt = noteTypes.get(n.noteTypeId);
                return (
                  <li
                    key={n.id}
                    className="absolute inset-x-0 flex items-center gap-3 border-b border-slate-100 px-3 dark:border-slate-800"
                    style={{
                      height: `${String(row.size)}px`,
                      transform: `translateY(${String(row.start)}px)`,
                    }}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-indigo-600"
                      aria-label={t('browse.selectNote', { text: preview(n) })}
                      checked={selected.has(n.id)}
                      onChange={() => {
                        toggle(n.id);
                      }}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left hover:underline"
                      aria-current={editing === n.id ? 'true' : undefined}
                      onClick={() => {
                        openNote(n.id);
                      }}
                    >
                      {preview(n) || t('browse.untitled')}
                    </button>
                    <span className="hidden w-40 truncate text-sm text-slate-600 md:block dark:text-slate-400">
                      {deckNames.get(n.deckId)}
                    </span>
                    <span className="hidden w-28 truncate text-sm text-slate-600 sm:block dark:text-slate-400">
                      {nt ? noteTypeLabel(nt, locale) : n.noteTypeId}
                    </span>
                    {n.needsReview && (
                      <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                        {t('browse.needsReviewBadge')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {editing && (
          <aside
            aria-label={t('editor.editTitle')}
            className="h-[65dvh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="mb-3 text-lg font-semibold">{t('editor.editTitle')}</h2>
            <NoteEditForm
              key={editing}
              noteId={editing}
              compact
              onSaved={() => {
                setEditing(null);
              }}
              onCancel={() => {
                setEditing(null);
              }}
            />
          </aside>
        )}
      </div>
      {results.data && results.data.total > LIMIT && (
        <p className="mt-2 text-sm">{t('browse.truncated', { count: LIMIT })}</p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('browse.deleteTitle', { count: selected.size })}
        description={t('browse.deleteWarning')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          runBulk((ctx) => deleteNotes(ctx, ids), t('browse.deleted'));
          setSelected(new Set());
        }}
      />
    </>
  );
}
