"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FilePlus2, Plus, Save } from "lucide-react";
import type { WordList } from "@/types/vocabulary";
import { Button, Modal, TextField } from "@/components/ui";
import { parseQuizletTerms } from "@/lib/vocabulary-import";

interface ListFormModalProps {
  open: boolean;
  list?: WordList | null;
  onClose: () => void;
  onAddWord?: (list: WordList) => void;
  onSubmit: (input: {
    title: string;
    language?: string;
    items?: Array<{
      word: string;
      translation: string;
    }>;
  }) => void;
}

export function ListFormModal({
  open,
  list,
  onClose,
  onAddWord,
  onSubmit
}: ListFormModalProps) {
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("");
  const [termsInput, setTermsInput] = useState("");
  const importResult = useMemo(() => parseQuizletTerms(termsInput), [termsInput]);
  const hasImportInput = termsInput.trim().length > 0;
  const hasInvalidImportLines = importResult.invalidLineNumbers.length > 0;
  const isCreating = !list;

  useEffect(() => {
    if (open) {
      setTitle(list?.title ?? "");
      setLanguage(list?.language ?? "");
      setTermsInput("");
    }
  }, [list, open]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || hasInvalidImportLines) {
      return;
    }

    onSubmit({
      title: trimmedTitle,
      language,
      items: isCreating ? importResult.terms : undefined
    });
  };

  const importSummary = hasInvalidImportLines
    ? `${importResult.invalidLineNumbers.length} invalid ${
        importResult.invalidLineNumbers.length === 1 ? "line" : "lines"
      }: ${importResult.invalidLineNumbers.slice(0, 5).join(", ")}${
        importResult.invalidLineNumbers.length > 5 ? ", ..." : ""
      }`
    : `${importResult.terms.length} valid ${
        importResult.terms.length === 1 ? "pair" : "pairs"
      }`;

  return (
    <Modal
      open={open}
      title={list ? "Edit list" : "Create list"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="list-form" type="submit" icon={<Save size={18} />}>
            Save list
          </Button>
        </>
      }
    >
      <form id="list-form" className="form-stack" onSubmit={handleSubmit}>
        <TextField
          id="list-title"
          label="List name"
          value={title}
          required
          placeholder="French travel"
          onChange={setTitle}
        />
        <TextField
          id="list-language"
          label="Language"
          value={language}
          placeholder="French"
          onChange={setLanguage}
        />
        {isCreating ? (
          <section className="terms-import" aria-labelledby="terms-import-title">
            <div className="terms-import-heading">
              <FilePlus2 size={18} aria-hidden="true" />
              <div>
                <h3 id="terms-import-title">Terms</h3>
                <p>Paste Quizlet export rows with a tab between each term and translation.</p>
              </div>
            </div>
            <TextField
              id="terms-import"
              label="Imported rows"
              value={termsInput}
              multiline
              rows={7}
              placeholder={"bonjour\thello\nmerci\tthank you"}
              error={hasInvalidImportLines ? importSummary : undefined}
              hint={!hasInvalidImportLines && hasImportInput ? importSummary : undefined}
              onChange={setTermsInput}
            />
          </section>
        ) : null}
        {list ? (
          <section className="edit-list-words" aria-labelledby="edit-list-words-title">
            <div>
              <p className="eyebrow">Words</p>
              <h3 id="edit-list-words-title">
                {list.items.length} {list.items.length === 1 ? "word" : "words"} in this list
              </h3>
              <p className="muted">Add vocabulary directly to this list.</p>
            </div>
            <Button
              variant="secondary"
              icon={<Plus size={18} />}
              onClick={() => onAddWord?.(list)}
            >
              Add word
            </Button>
          </section>
        ) : null}
      </form>
    </Modal>
  );
}
