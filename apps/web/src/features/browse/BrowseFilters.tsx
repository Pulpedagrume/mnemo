import { useTranslation } from 'react-i18next';
import type { CardState, Deck, Locale, NoteType } from '@mnemo/core';
import { CARD_STATES } from '@mnemo/core';
import type { NoteSearch } from '@mnemo/storage';
import { inputClass } from '../../components/ui/Field';
import { noteTypeLabel } from '../editor/NoteEditor';

export const LIMIT = 2_000;

export interface Filters {
  text: string;
  deckId: string;
  tag: string;
  noteTypeId: string;
  state: '' | CardState;
  suspended: boolean;
  leech: boolean;
  needsReview: boolean;
  sort: 'created' | 'updated';
  descending: boolean;
}

export const EMPTY: Filters = {
  text: '',
  deckId: '',
  tag: '',
  noteTypeId: '',
  state: '',
  suspended: false,
  leech: false,
  needsReview: false,
  sort: 'created',
  descending: true,
};

export function toSearch(f: Filters, subtree: (id: string) => string[]): NoteSearch {
  const q: NoteSearch = { sort: f.sort, descending: f.descending, limit: LIMIT };
  if (f.text.trim()) q.text = f.text.trim();
  if (f.deckId) q.deckIds = subtree(f.deckId);
  if (f.tag) q.tags = [f.tag];
  if (f.noteTypeId) q.noteTypeIds = [f.noteTypeId];
  if (f.state) q.cardState = f.state;
  if (f.suspended) q.suspended = true;
  if (f.leech) q.leech = true;
  if (f.needsReview) q.needsReview = true;
  return q;
}

interface Props {
  filters: Filters;
  set: (patch: Partial<Filters>) => void;
  decks: readonly Deck[];
  tags: readonly { tag: string; count: number }[];
  noteTypes: readonly NoteType[];
  locale: Locale;
}

/** Search and filter controls of the note browser. */
export function BrowseFilters({ filters, set, decks, tags, noteTypes, locale }: Props) {
  const { t } = useTranslation();
  const check = (key: 'suspended' | 'leech' | 'needsReview') => (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-indigo-600"
        checked={filters[key]}
        onChange={(e) => {
          set({ [key]: e.target.checked });
        }}
      />
      {t(`browse.filter.${key}`)}
    </label>
  );

  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <input
        type="search"
        aria-label={t('browse.searchText')}
        placeholder={t('browse.searchText')}
        className={`${inputClass} sm:col-span-2`}
        value={filters.text}
        onChange={(e) => {
          set({ text: e.target.value });
        }}
      />
      <select
        aria-label={t('browse.filter.deck')}
        className={inputClass}
        value={filters.deckId}
        onChange={(e) => {
          set({ deckId: e.target.value });
        }}
      >
        <option value="">{t('browse.allDecks')}</option>
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        aria-label={t('browse.filter.tag')}
        className={inputClass}
        value={filters.tag}
        onChange={(e) => {
          set({ tag: e.target.value });
        }}
      >
        <option value="">{t('browse.allTags')}</option>
        {tags.map((x) => (
          <option key={x.tag} value={x.tag}>{`${x.tag} (${String(x.count)})`}</option>
        ))}
      </select>
      <select
        aria-label={t('browse.filter.type')}
        className={inputClass}
        value={filters.noteTypeId}
        onChange={(e) => {
          set({ noteTypeId: e.target.value });
        }}
      >
        <option value="">{t('browse.allTypes')}</option>
        {noteTypes.map((nt) => (
          <option key={nt.id} value={nt.id}>
            {noteTypeLabel(nt, locale)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('browse.filter.state')}
        className={inputClass}
        value={filters.state}
        onChange={(e) => {
          set({ state: e.target.value as Filters['state'] });
        }}
      >
        <option value="">{t('browse.allStates')}</option>
        {CARD_STATES.map((s) => (
          <option key={s} value={s}>
            {t(`cardState.${s}`)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('browse.sort')}
        className={inputClass}
        value={`${filters.sort}-${filters.descending ? 'desc' : 'asc'}`}
        onChange={(e) => {
          const [sort, dir] = e.target.value.split('-');
          set({ sort: sort as Filters['sort'], descending: dir === 'desc' });
        }}
      >
        {(['created-desc', 'created-asc', 'updated-desc', 'updated-asc'] as const).map((v) => (
          <option key={v} value={v}>
            {t(`browse.sortBy.${v}`)}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-4">
        {check('suspended')}
        {check('leech')}
        {check('needsReview')}
      </div>
    </div>
  );
}
