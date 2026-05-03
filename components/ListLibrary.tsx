import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { ProgressSummary } from "@/components/ProgressSummary";
import { Button, IconButton, cx } from "@/components/ui";
import type { WordList } from "@/types/vocabulary";

interface ListLibraryProps {
  lists: WordList[];
  selectedListId: string | null;
  onCreate: () => void;
  onDelete: (listId: string) => void;
  onEdit: (list: WordList) => void;
  onSelect: (listId: string) => void;
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(value));

export function ListLibrary({
  lists,
  selectedListId,
  onCreate,
  onDelete,
  onEdit,
  onSelect
}: ListLibraryProps) {
  return (
    <section className="library" aria-labelledby="library-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AJ Library</p>
          <h2 id="library-title">Word lists</h2>
        </div>
        <Button size="sm" icon={<Plus size={17} />} onClick={onCreate}>
          New
        </Button>
      </div>

      {lists.length ? (
        <div className="list-grid">
          {lists.map((list) => (
            <article
              className={cx(
                "list-card",
                list.id === selectedListId && "list-card-active"
              )}
              key={list.id}
            >
              <button
                type="button"
                className="list-card-main"
                onClick={() => onSelect(list.id)}
              >
                <span className="list-icon" aria-hidden="true">
                  <BookOpen size={19} />
                </span>
                <span>
                  <strong>{list.title}</strong>
                  <small>
                    {list.items.length} words
                    {list.language ? ` - ${list.language}` : ""}
                  </small>
                </span>
              </button>
              <ProgressSummary items={list.items} compact />
              <div className="list-card-footer">
                <span>Updated {formatDate(list.updatedAt)}</span>
                <div className="inline-actions">
                  <IconButton label={`Edit ${list.title}`} onClick={() => onEdit(list)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton
                    label={`Delete ${list.title}`}
                    variant="danger"
                    onClick={() => onDelete(list.id)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpen size={28} />
          <h3>No lists yet</h3>
          <Button icon={<Plus size={18} />} onClick={onCreate}>
            Create list
          </Button>
        </div>
      )}
    </section>
  );
}
