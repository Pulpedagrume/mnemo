import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initI18n } from '../../../i18n';
import { McqWidget } from './McqWidget';
import { OrderingWidget } from './OrderingWidget';
import { TypedWidget } from './TypedWidget';
import { MatchingWidget } from './MatchingWidget';
import { HintButton } from '../HintButton';

beforeEach(() => {
  initI18n('fr');
});

describe('McqWidget', () => {
  const choices = [
    { text: 'Fibre', correct: true, explanation: 'Insensible aux EMI.' },
    { text: 'UTP', correct: false },
    { text: 'STP', correct: true },
  ];
  const display = choices.map((c, index) => ({ index, text: c.text }));

  it('grades with text labels (not color only) and shows explanations', async () => {
    const onValidate = vi.fn();
    render(<McqWidget choices={choices} display={display} multiple onValidate={onValidate} />);
    expect(screen.getByText(/Plusieurs réponses possibles/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Fibre'));
    await userEvent.click(screen.getByLabelText('UTP'));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(screen.getByText('Bonne réponse')).toBeInTheDocument();
    expect(screen.getByText('Erreur')).toBeInTheDocument();
    expect(screen.getByText('À choisir')).toBeInTheDocument();
    expect(screen.getByText('Insensible aux EMI.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Il y a des erreurs.');
    expect(onValidate).toHaveBeenCalledWith({
      correct: false,
      suggestedRating: 1,
      answer: 'Fibre | UTP',
    });
    expect(screen.getByLabelText(/^STP/)).toBeDisabled();
  });
});

describe('OrderingWidget', () => {
  it('reorders with keyboard-accessible buttons and announces moves', async () => {
    const onValidate = vi.fn();
    const steps = ['A', 'B', 'C'];
    render(
      <OrderingWidget
        steps={steps}
        initial={[
          { index: 2, text: 'C' },
          { index: 0, text: 'A' },
          { index: 1, text: 'B' },
        ]}
        onValidate={onValidate}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Descendre « C »' }));
    await userEvent.click(screen.getByRole('button', { name: 'Descendre « C »' }));
    expect(screen.getByText('« C » est maintenant en position 3.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(onValidate).toHaveBeenCalledWith({
      correct: true,
      suggestedRating: 3,
      answer: 'A > B > C',
    });
  });
});

describe('TypedWidget', () => {
  it('accepts variants ignoring case and accents, and shows a diff on mistakes', async () => {
    const onValidate = vi.fn();
    const { unmount } = render(
      <TypedWidget
        answers={['Élève']}
        caseSensitive={false}
        ignoreAccents
        onValidate={onValidate}
      />,
    );
    await userEvent.type(screen.getByLabelText('Votre réponse'), 'eleve{Enter}');
    expect(onValidate).toHaveBeenLastCalledWith({
      correct: true,
      suggestedRating: 3,
      answer: 'eleve',
    });
    unmount();

    render(
      <TypedWidget
        answers={['commutateur']}
        caseSensitive={false}
        ignoreAccents
        onValidate={onValidate}
      />,
    );
    await userEvent.type(screen.getByLabelText('Votre réponse'), 'comutateur{Enter}');
    expect(onValidate).toHaveBeenLastCalledWith({
      correct: false,
      suggestedRating: 1,
      answer: 'comutateur',
    });
    expect(screen.getByText('Réponse attendue : commutateur')).toBeInTheDocument();
    expect(document.querySelector('ins')).not.toBeNull();
  });
});

describe('MatchingWidget', () => {
  it('uses native selects and reports the expected answer when wrong', async () => {
    const onValidate = vi.fn();
    render(
      <MatchingWidget
        pairs={[
          { left: 'Bureau', right: 'Cuivre' },
          { left: 'Campus', right: 'Fibre' },
        ]}
        left={[
          { index: 0, text: 'Bureau' },
          { index: 1, text: 'Campus' },
        ]}
        right={['Fibre', 'Cuivre']}
        onValidate={onValidate}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Bureau'), 'Fibre');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(screen.getByText('Réponse attendue : Cuivre')).toBeInTheDocument();
    expect(screen.getByText('Manquant')).toBeInTheDocument();
    expect(onValidate.mock.calls[0]?.[0]).toMatchObject({ correct: false, suggestedRating: 1 });
  });
});

describe('HintButton', () => {
  it('reveals hints one at a time with an accessible label', async () => {
    let shown = 0;
    const { rerender } = render(
      <HintButton
        hints={['Indice discret', 'Indice explicite']}
        shown={shown}
        onShowNext={() => {
          shown++;
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Afficher un indice' }));
    rerender(
      <HintButton
        hints={['Indice discret', 'Indice explicite']}
        shown={shown}
        onShowNext={() => {
          shown++;
        }}
      />,
    );
    expect(screen.getByText('Indice discret')).toBeInTheDocument();
    expect(screen.queryByText('Indice explicite')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afficher un indice' })).toHaveTextContent(
      'Indice suivant (1 restant)',
    );
  });
});
