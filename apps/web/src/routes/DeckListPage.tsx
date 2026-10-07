import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Plus, Search } from 'lucide-react';
import type { Deck } from '@mnemo/core';
import {
  createDeck,
  deckTreeWithCounts,
  deleteDeck,
  listPresets,
  renameDeck,
  updateDeck,
} from '@mnemo/services';
import { useMutation, useQuery } from '../app/services';
import { errorMessage } from '../app/errors';
import { PageTitle } from '../components/PageTitle';
import { Button, focusRing } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { inputClass } from '../components/ui/Field';
import { toast } from '../components/ui/Toaster';
import {
  CustomStudyDialog,
  DeckNameDialog,
  DeckOptionsDialog,
} from '../features/decks/DeckDialogs';
import { DeckTree, type DeckAction } from '../features/decks/DeckTree';
import { encodeCustom } from '../features/study/customStudy';

type Pending = { action: DeckAction | 'create'; deck?: Deck } | null;

export function DeckListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const tree = useQuery((ctx) => deckTreeWithCounts(ctx), []);
  const presets = useQuery((ctx) => listPresets(ctx), []);
  const tags = useQuery((ctx) => ctx.repo.notes.tagCounts(), []);
  const run = useMutation(async (ctx, fn: (c: typeof ctx) => Promise<unknown>) => fn(ctx));
  const close = () => {
    setPending(null);
  };
  const act = (fn: Parameters<typeof run>[0], success?: string) => {
    run(fn).then(
      () => {
        close();
        if (success) toast(success, 'success');
      },
      (e: unknown) => {
        toast(errorMessage(e, t), 'error');
      },
    );
  };

  const onAction = (action: DeckAction, deck: Deck) => {
    if (action === 'add') void navigate(`/notes/new?deck=${deck.id}`);
    else if (action === 'stats') void navigate(`/stats?deck=${deck.id}`);
    else setPending({ action, deck });
  };

  const deck = pending?.deck;
  return (
    <>
      <PageTitle
        title={t('decks.title')}
        actions={
          <>
            <Button
              onClick={() => {
                setPending({ action: 'create' });
              }}
            >
              <Plus aria-hidden size={18} />
              {t('decks.create')}
            </Button>
            <Link
              to="/notes/new"
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 font-medium text-white hover:bg-indigo-700 ${focusRing}`}
            >
              <Plus aria-hidden size={18} />
              {t('decks.addNote')}
            </Link>
          </>
        }
      />
      <div className="relative mb-4">
        <Search
          aria-hidden
          size={18}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500"
        />
        <input
          type="search"
          aria-label={t('decks.search')}
          placeholder={t('decks.search')}
          className={`${inputClass} pl-10`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
      </div>
      {tree.status === 'success' ? (
        <DeckTree entries={tree.data} search={search} onAction={onAction} />
      ) : tree.status === 'error' ? (
        <p role="alert">{errorMessage(tree.error, t)}</p>
      ) : (
        <p aria-busy="true">{t('common.loading')}</p>
      )}

      <DeckNameDialog
        open={pending?.action === 'create'}
        onOpenChange={close}
        title={t('decks.create')}
        initial=""
        submitLabel={t('common.create')}
        onSubmit={(name) => {
          act((ctx) => createDeck(ctx, name), t('decks.created'));
        }}
      />
      {deck && (
        <>
          <DeckNameDialog
            open={pending.action === 'rename'}
            onOpenChange={close}
            title={t('decks.action.rename')}
            initial={deck.name}
            submitLabel={t('common.save')}
            onSubmit={(name) => {
              act((ctx) => renameDeck(ctx, deck.id, name));
            }}
          />
          {pending.action === 'options' && (
            <DeckOptionsDialog
              open
              onOpenChange={close}
              deck={deck}
              presets={presets.data ?? []}
              onSubmit={(presetId, description) => {
                act(
                  (ctx) => updateDeck(ctx, deck.id, { presetId, description }),
                  t('common.saved'),
                );
              }}
            />
          )}
          <CustomStudyDialog
            open={pending.action === 'custom'}
            onOpenChange={close}
            tags={(tags.data ?? []).map((x) => x.tag)}
            onStart={(custom) => {
              void navigate(`/study/${deck.id}?${encodeCustom(custom)}`);
            }}
          />
          <ConfirmDialog
            open={pending.action === 'delete'}
            onOpenChange={close}
            title={t('decks.deleteTitle', { name: deck.name })}
            description={t('decks.deleteWarning')}
            confirmLabel={t('common.delete')}
            danger
            onConfirm={() => {
              act((ctx) => deleteDeck(ctx, deck.id), t('decks.deleted'));
            }}
          />
        </>
      )}
    </>
  );
}
