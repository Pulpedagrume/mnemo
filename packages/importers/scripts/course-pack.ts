import type { ImportDocument, ImportNote } from '../src/format/schema';
import {
  ACRONYMS,
  BIO_FACTS,
  CLOZE_ORGANELLE,
  EVENTS,
  ORGANELLES,
  OSI,
  PORTS,
} from './course-data';

type Note = ImportNote & Record<string, unknown>;

const pad = (n: number): string => String(n).padStart(3, '0');

function basics(): Note[] {
  const notes: Note[] = [];
  PORTS.forEach(([proto, port], i) => {
    notes.push({
      type: 'basic',
      uid: `net-1-${pad(i + 1)}`,
      deck: 'Réseaux::Ports',
      tags: ['ports'],
      front: `Quel est le port par défaut de ${proto} ?`,
      back: `Le port ${port}.`,
    });
  });
  ACRONYMS.forEach(([acro, meaning], i) => {
    const note: Note = {
      type: 'basic',
      uid: `net-2-${pad(i + 1)}`,
      deck: 'Réseaux::Acronymes',
      tags: ['vocabulaire'],
      front: `Que signifie l’acronyme ${acro} ?`,
      back: meaning,
    };
    if (i % 4 === 0) note.hint = 'Développez le sigle en anglais.';
    notes.push(note);
  });
  OSI.forEach((name, i) => {
    notes.push({
      type: 'basic',
      uid: `net-3-${pad(i + 1)}`,
      deck: 'Réseaux::Modèle OSI',
      tags: ['osi'],
      front: `Quel est le nom de la couche ${i + 1} du modèle OSI ?`,
      back: `La couche ${name}.`,
      hint: 'On compte à partir du support physique.',
    });
  });
  ORGANELLES.forEach(([organelle, role], i) => {
    notes.push({
      type: 'basic',
      uid: `bio-1-${pad(i + 1)}`,
      deck: 'Biologie::Cellule',
      tags: ['cellule'],
      front: `Quel est le rôle ${organelle} ?`,
      back: role,
    });
  });
  BIO_FACTS.forEach((fact, i) => {
    notes.push({
      type: 'basic',
      uid: `bio-2-${pad(i + 1)}`,
      deck: 'Biologie::Génétique',
      tags: ['genetique'],
      front: fact.q,
      back: fact.a,
    });
  });
  EVENTS.forEach(([event, year], i) => {
    const note: Note = {
      type: 'basic',
      uid: `his-1-${pad(i + 1)}`,
      deck: 'Histoire::Dates',
      tags: ['chronologie'],
      front: `En quelle année a eu lieu ${event} ?`,
      back: `En ${year}.`,
    };
    if (i % 5 === 0) note.explanation = 'Date à replacer sur la frise chronologique du chapitre.';
    notes.push(note);
  });
  return notes;
}

function clozes(): Note[] {
  const notes: Note[] = [];
  PORTS.forEach(([proto, port], i) => {
    notes.push({
      type: 'cloze',
      uid: `net-4-${pad(i + 1)}`,
      deck: 'Réseaux::Ports',
      tags: ['ports'],
      text: `Le protocole {{c1::${proto}}} écoute par défaut sur le port {{c2::${port}}}.`,
    });
  });
  CLOZE_ORGANELLE.forEach((text, i) => {
    notes.push({
      type: 'cloze',
      uid: `bio-3-${pad(i + 1)}`,
      deck: 'Biologie::Cellule',
      tags: ['cellule'],
      text,
      ...(i === 0 ? { extra: 'Voir le schéma de la cellule animale.' } : {}),
    });
  });
  return notes;
}

function mcqs(): Note[] {
  const notes: Note[] = [];
  for (let i = 0; i < 15; i++) {
    const [event, year] = EVENTS[i] ?? ['', ''];
    const others = [3, 7, 11].map((k) => EVENTS[(i + k) % EVENTS.length]?.[0] ?? '');
    const choices = others.map((text) => ({ text, correct: false }));
    choices.splice(i % 4, 0, { text: event, correct: true });
    notes.push({
      type: 'mcq',
      uid: `his-2-${pad(i + 1)}`,
      deck: 'Histoire::Dates',
      tags: ['chronologie'],
      question: `Quel événement a eu lieu en ${year} ?`,
      choices,
    });
  }
  return notes;
}

/** The 120-note course pack (80 basic, 25 cloze, 15 mcq). */
export function coursePack(): ImportDocument {
  return {
    format: 'mnemo/1',
    meta: { title: 'Révisions de fin de trimestre', language: 'fr', generator: 'exemple' },
    defaults: { tags: ['revision'] },
    notes: [...basics(), ...clozes(), ...mcqs()] as ImportNote[],
  };
}

/** 45 basic notes (A3: the JSON is cut in the middle of the 41st). */
export function longPack(): ImportDocument {
  return { format: 'mnemo/1', notes: basics().slice(0, 45) };
}
