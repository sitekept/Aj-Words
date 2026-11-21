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

  // `<= 1` throughout, not `=== 1`: zero is singular in French.
  const importSummary = hasInvalidImportLines
    ? `${importResult.invalidLineNumbers.length} ${
        importResult.invalidLineNumbers.length <= 1 ? "ligne invalide" : "lignes invalides"
      } : ${importResult.invalidLineNumbers.slice(0, 5).join(", ")}${
        importResult.invalidLineNumbers.length > 5 ? ", ..." : ""
      }`
    : `${importResult.terms.length} ${
        importResult.terms.length <= 1 ? "paire valide" : "paires valides"
      }`;

  return (
    <Modal
      open={open}
      title={list ? "Modifier la liste" : "Créer une liste"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button form="list-form" type="submit" icon={<Save size={18} />}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="list-form" className="form-stack" onSubmit={handleSubmit}>
        <TextField
          id="list-title"
          label="Nom de la liste"
          value={title}
          required
          placeholder="Voyage en Espagne"
          onChange={setTitle}
        />
        <TextField
          id="list-language"
          label="Langue"
          value={language}
          placeholder="Espagnol"
          onChange={setLanguage}
        />
        {isCreating ? (
          <section className="terms-import" aria-labelledby="terms-import-title">
            <div className="terms-import-heading">
              <FilePlus2 size={18} aria-hidden="true" />
              <div>
                <h3 id="terms-import-title">Termes</h3>
                <p>
                  Collez vos lignes exportées depuis Quizlet, avec une tabulation
                  entre chaque terme et sa traduction.
                </p>
              </div>
            </div>
            <TextField
              id="terms-import"
              label="Lignes importées"
              value={termsInput}
              multiline
              rows={7}
              placeholder={"hola\tbonjour\ngracias\tmerci"}
              error={hasInvalidImportLines ? importSummary : undefined}
              hint={!hasInvalidImportLines && hasImportInput ? importSummary : undefined}
              onChange={setTermsInput}
            />
          </section>
        ) : null}
        {list ? (
          <section className="edit-list-words" aria-labelledby="edit-list-words-title">
            <div>
              <p className="eyebrow">Mots</p>
              <h3 id="edit-list-words-title">
                {list.items.length} {list.items.length <= 1 ? "mot" : "mots"} dans cette liste
              </h3>
              <p className="muted">Ajoutez du vocabulaire directement à cette liste.</p>
            </div>
            <Button
              variant="secondary"
              icon={<Plus size={18} />}
              onClick={() => onAddWord?.(list)}
            >
              Ajouter un mot
            </Button>
          </section>
        ) : null}
      </form>
    </Modal>
  );
}
