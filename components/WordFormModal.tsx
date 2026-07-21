"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, Save, X } from "lucide-react";
import type { VocabularyItem } from "@/types/vocabulary";
import type { WordInput } from "@/lib/useVocabularyStore";
import { Button, IconButton, Modal, TextField } from "@/components/ui";
import { compressImageFile, createImageId } from "@/lib/image-compress";
import { putImage } from "@/lib/image-store";
import { useItemImage } from "@/lib/useItemImage";

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
  const [imageId, setImageId] = useState<string | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewSrc = useItemImage(imageId, imageUrl);

  useEffect(() => {
    if (open) {
      setWord(item?.word ?? "");
      setTranslation(item?.translation ?? "");
      setNote(item?.note ?? "");
      setExample(item?.example ?? "");
      setAltAnswersText(joinCommaList(item?.altAnswers));
      setTagsText(joinCommaList(item?.tags));
      setImageId(item?.imageId);
      setImageUrl(item?.imageUrl ?? "");
      setImageBusy(false);
    }
  }, [item, open]);

  const handleImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) {
      return;
    }

    setImageBusy(true);
    try {
      const blob = await compressImageFile(file);
      const id = createImageId();
      const stored = await putImage(id, blob);
      if (stored) {
        // A local image and an external URL are mutually exclusive.
        setImageId(id);
        setImageUrl("");
      }
    } finally {
      setImageBusy(false);
    }
  };

  const clearImage = () => {
    // The old blob (if any) is left for load-time GC in image-store.
    setImageId(undefined);
    setImageUrl("");
  };

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
      tags: splitCommaList(tagsText),
      imageId,
      imageUrl: imageUrl.trim()
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

        <div className="field word-image-field">
          <span>Image</span>
          {previewSrc ? (
            <div className="word-image-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSrc} alt="" />
              <IconButton
                label="Remove image"
                variant="danger"
                onClick={clearImage}
              >
                <X size={16} />
              </IconButton>
            </div>
          ) : null}
          <div className="word-image-actions">
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus size={16} />}
              disabled={imageBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {imageBusy ? "Processing…" : previewSrc ? "Replace" : "Upload"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="visually-hidden-input"
              onChange={handleImageFile}
            />
          </div>
          <TextField
            id="word-image-url"
            label="…or image URL"
            value={imageUrl}
            placeholder="https://example.com/word.jpg"
            hint={
              imageId
                ? "Remove the uploaded image to use an external URL instead."
                : "Stored images live on this device; a URL travels with sharing."
            }
            onChange={(value) => {
              setImageUrl(value);
              if (value.trim()) {
                setImageId(undefined);
              }
            }}
          />
        </div>
      </form>
    </Modal>
  );
}
