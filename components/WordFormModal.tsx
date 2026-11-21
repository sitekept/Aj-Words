"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { VocabularyItem } from "@/types/vocabulary";
import type { WordInput } from "@/lib/useVocabularyStore";
import { Button, Modal, TextField } from "@/components/ui";

interface WordFormModalProps {
  open: boolean;
  item?: VocabularyItem | null;
  onClose: () => void;
  onSubmit: (input: WordInput) => void;
}

// Comma-separated inputs live at the modal boundary; the store works with
// string arrays. Blank input yields [] which clears the field on save.
const splitCommaList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const joinCommaList = (values: string[] | undefined) =>
  values?.join(", ") ?? "";

export function WordFormModal({
  open,
  item,
  onClose,
  onSubmit
}: WordFormModalProps) {
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [note, setNote] = useState("");
  const [example, setExample] = useState("");
  const [altAnswersText, setAltAnswersText] = useState("");
  const [tagsText, setTagsText] = useState("");

  useEffect(() => {
    if (open) {
      setWord(item?.word ?? "");
      setTranslation(item?.translation ?? "");
      setNote(item?.note ?? "");
      setExample(item?.example ?? "");
      setAltAnswersText(joinCommaList(item?.altAnswers));
      setTagsText(joinCommaList(item?.tags));
    }
  }, [item, open]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!word.trim() || !translation.trim()) {
      return;
    }

    onSubmit({
      word,
      translation,
      note,
      example,
      altAnswers: splitCommaList(altAnswersText),
      tags: splitCommaList(tagsText)
    });
  };

  return (
    <Modal
      open={open}
      title={item ? "Modifier le mot" : "Ajouter un mot"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button form="word-form" type="submit" icon={<Save size={18} />}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="word-form" className="form-stack" onSubmit={handleSubmit}>
        <TextField
          id="word"
          label="Mot"
          value={word}
          required
          placeholder="hola"
          onChange={setWord}
        />
        <TextField
          id="translation"
          label="Traduction"
          value={translation}
          required
          placeholder="bonjour"
          onChange={setTranslation}
        />
        <TextField
          id="word-note"
          label="Note"
          value={note}
          placeholder="Rappel ou nuance (facultatif)"
          onChange={setNote}
        />
        <TextField
          id="word-example"
          label="Phrase d'exemple"
          value={example}
          placeholder="¿Hola, qué tal?"
          onChange={setExample}
        />
        <TextField
          id="word-alt-answers"
          label="Autres réponses acceptées"
          value={altAnswersText}
          placeholder="salut, bonjour"
          hint="Séparées par des virgules ; acceptées aussi dans les quiz écrits"
          onChange={setAltAnswersText}
        />
        <TextField
          id="word-tags"
          label="Étiquettes"
          value={tagsText}
          placeholder="salutations, unité 1"
          hint="Séparées par des virgules"
          onChange={setTagsText}
        />
      </form>
    </Modal>
  );
}
