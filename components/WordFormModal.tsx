"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { VocabularyItem } from "@/types/vocabulary";
import { Button, Modal, TextField } from "@/components/ui";

interface WordFormModalProps {
  open: boolean;
  item?: VocabularyItem | null;
  onClose: () => void;
  onSubmit: (input: {
    word: string;
    translation: string;
  }) => void;
}

export function WordFormModal({
  open,
  item,
  onClose,
  onSubmit
}: WordFormModalProps) {
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");

  useEffect(() => {
    if (open) {
      setWord(item?.word ?? "");
      setTranslation(item?.translation ?? "");
    }
  }, [item, open]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!word.trim() || !translation.trim()) {
      return;
    }

    onSubmit({
      word,
      translation
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
      </form>
    </Modal>
  );
}
