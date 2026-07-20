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
      title={item ? "Edit word" : "Add word"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="word-form" type="submit" icon={<Save size={18} />}>
            Save word
          </Button>
        </>
      }
    >
      <form id="word-form" className="form-stack" onSubmit={handleSubmit}>
        <TextField
          id="word"
          label="Word"
          value={word}
          required
          placeholder="bonjour"
          onChange={setWord}
        />
        <TextField
          id="translation"
          label="Translation"
          value={translation}
          required
          placeholder="hello"
          onChange={setTranslation}
        />
        <TextField
          id="word-note"
          label="Note"
          value={note}
          placeholder="Optional reminder or nuance"
          onChange={setNote}
        />
        <TextField
          id="word-example"
          label="Example sentence"
          value={example}
          placeholder="Bonjour, comment ça va ?"
          onChange={setExample}
        />
        <TextField
          id="word-alt-answers"
          label="Alternative answers"
          value={altAnswersText}
          placeholder="hi, good morning"
          hint="Comma-separated; also accepted in written quizzes"
          onChange={setAltAnswersText}
        />
        <TextField
          id="word-tags"
          label="Tags"
          value={tagsText}
          placeholder="greetings, unit 1"
          hint="Comma-separated"
          onChange={setTagsText}
        />
      </form>
    </Modal>
  );
}
