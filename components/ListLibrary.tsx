import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { ProgressSummary } from "@/components/ProgressSummary";
import { countDue } from "@/lib/srs";
import { Button, IconButton, cx } from "@/components/ui";
import { UI_LOCALE } from "@/lib/formatting";
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
  new Intl.DateTimeFormat(UI_LOCALE, {
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
  const now = new Date().toISOString();

  return (
    <section className="library" aria-labelledby="library-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Bibliothèque</p>
          <h2 id="library-title">Listes de mots</h2>
        </div>
        <Button size="sm" icon={<Plus size={17} />} onClick={onCreate}>
          Nouvelle
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
                    {list.items.length} {list.items.length <= 1 ? "mot" : "mots"}
                    {list.language ? ` · ${list.language}` : ""}
                  </small>
                </span>
              </button>
              <ProgressSummary items={list.items} compact />
              <div className="list-card-footer">
                <span>
                  Modifiée le {formatDate(list.updatedAt)}
                  {countDue(list.items, now) > 0 ? (
                    <>
                      {" "}
                      <span className="due-badge">
                        {countDue(list.items, now)} à revoir
                      </span>
                    </>
                  ) : null}
                </span>
                <div className="inline-actions">
                  <IconButton label={`Modifier ${list.title}`} onClick={() => onEdit(list)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton
                    label={`Supprimer ${list.title}`}
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
          <h3>Aucune liste pour l&rsquo;instant</h3>
          <p>
            Créez une liste de mots, ou collez directement vos termes exportés
            depuis Quizlet. Vous pourrez ensuite la réviser en cartes mémo ou
            vous tester dessus.
          </p>
          <Button icon={<Plus size={18} />} onClick={onCreate}>
            Créer une liste
          </Button>
        </div>
      )}
    </section>
  );
}
