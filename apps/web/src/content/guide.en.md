# Guide: creating cards with an AI

Mnemo contains no AI and requires none. It writes a **prompt** (instructions) for you to paste
into the assistant of your choice, together with your course. The AI returns a file that
Mnemo checks before importing it.

## The 5-step journey

1. Open **Import with AI** and choose what you want (flashcards, cloze deletions, multiple
   choice, or the smart mix recommended for a whole course).
2. Copy the generated prompt.
3. In your AI assistant, paste the prompt **then** add your document.
4. Copy the AI's answer (or download the file it offers).
5. Come back to Mnemo and paste or drop the answer: the preview shows the cards exactly as when
   studying, with any problems. Import, then study.

## Attaching a PDF or a long text

- **Upload**: most assistants accept an attached file (PDF, document, image). Attach it in the
  same message as the prompt.
- **Pasted text**: if uploading is not possible, copy the document's text and paste it in place
  of `[PASTE OR ATTACH YOUR DOCUMENT HERE]`.
- Slides exported as PDF work well; for a scanned document, make sure the text can be selected
  (otherwise the AI cannot read it properly).

## Document too long?

Tick **“My document is long”** in the wizard:

1. first ask for a **plan** (the AI splits the document into batches without creating cards);
2. then generate each **batch** in the same conversation;
3. finish with a **review** of the complete file (duplicates, ambiguous questions);
4. import the files one by one or together.

If the answer stops in the middle, Mnemo detects it (“The rest is missing”), recovers the
complete notes and gives you a **“Continue”** prompt to paste in the same conversation.

## Which format?

- **Markdown** (recommended): readable, few errors, ideal for most courses.
- **YAML**: better with lots of LaTeX formulas or code (no backslash escaping).
- **JSON**: the strictest, handy for scripts; LaTeX formulas need doubled `\`, which causes more
  errors.
- **CSV**: for spreadsheets; limited to basic cards, cloze deletions and multiple choice.

## Fixing a file

If the preview reports errors, click **“Copy the fix prompt”** and paste it in the **same
conversation**: the AI only sends back the fixed notes. Valid notes can be imported right away
(partial import).

## Updating cards already imported

Each note has a stable `uid` (for example `network-4-012`). If you regenerate cards keeping the
same `uid` values and import in **“Update”** mode, existing notes are modified **without losing
their review history**, and no duplicate is created. An import can always be undone from the
import history.

## Good practices

- Review the preview: an AI can be wrong. Cards marked **“Needs review”** flag a doubt.
- Keep one card = one idea; delete the ones you do not need.
- Your data stays on your device: Mnemo sends nothing to the AI.
