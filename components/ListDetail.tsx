"use client";

import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ClipboardCheck,
  Clock,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Shuffle,
  Trash2,
  Volume2
} from "lucide-react";
import { ProgressSummary } from "@/components/ProgressSummary";
import { StatusBadge } from "@/components/StatusBadge";
import { TestHistory } from "@/components/TestHistory";
import { countDue } from "@/lib/srs";
import { canUseChoice } from "@/lib/quiz-options";
import { canSpeak, resolveSpeechLangs, speak } from "@/lib/speech";
import { useSpeechVoices } from "@/lib/useSpeechVoices";
import { Button, IconButton } from "@/components/ui";
import type {
  LearningStatus,
  QuizDirection,
  QuizMode,
  TestHistoryEntry,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";

interface ListDetailProps {
  /**
   * False in the curated-library build: the words ship in the bundle, so
   * everything that would change them is hidden. "Réinitialiser la progression"
   * deliberately stays — that is progress, not content, and starting a list over
   * is an ordinary study move. See lib/app-mode.ts.
   */
  canEdit: boolean;
  direction: QuizDirection;
  list: WordList;
  onAddWord: () => void;
  onBack: () => void;
  onDeleteList: () => void;
  onDeleteWord: (itemId: string) => void;
  onDirectionChange: (direction: QuizDirection) => void;
  onEditList: () => void;
  onEditWord: (item: VocabularyItem) => void;
  onResetProgress: () => void;
  onReviewTest: (entry: TestHistoryEntry) => void;
  onShareList: () => void;
  onStartFlashcards: () => void;
  onStartQuiz: (mode: QuizMode) => void;
}

type StatusFilter = "all" | LearningStatus;

// Labels only: `value` is matched against the persisted `status` field.
const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "new", label: "Nouveaux" },
  { value: "learning", label: "En cours" },
  { value: "mastered", label: "Acquis" }
];

export function ListDetail({
  canEdit,
  direction,
  list,
  onAddWord,
  onBack,
  onDeleteList,
  onDeleteWord,
  onDirectionChange,
  onEditList,
  onEditWord,
  onResetProgress,
  onReviewTest,
  onShareList,
  onStartFlashcards,
  onStartQuiz
}: ListDetailProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // 0 until mounted on a speech-capable browser; bumps once voices load.
  const speechVersion = useSpeechVoices();
  const speechLangs = resolveSpeechLangs(list.language);

  const speakButton = (text: string, lang: string | undefined) =>
    speechVersion > 0 && lang && canSpeak(lang) ? (
      <IconButton
        label={`Écouter « ${text} »`}
        onClick={() => speak(text, lang)}
      >
        <Volume2 size={16} />
      </IconButton>
    ) : null;

  // Reset the word filters when the user switches to a different list.
  const [filterListId, setFilterListId] = useState(list.id);
  if (filterListId !== list.id) {
    setFilterListId(list.id);
    setQuery("");
    setStatusFilter("all");
  }

  const hasWords = list.items.length > 0;
  // Must agree with QuizRunner: offering "Multiple choice" for a list that
  // cannot fill four distinct options would silently fall back to written.
  const hasChoiceSet = canUseChoice(list.items, direction);
  const dueCount = countDue(list.items, new Date().toISOString());

  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0 || statusFilter !== "all";
  const visibleItems = list.items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return (
      item.word.toLowerCase().includes(normalizedQuery) ||
      item.translation.toLowerCase().includes(normalizedQuery) ||
      (item.note?.toLowerCase().includes(normalizedQuery) ?? false) ||
      (item.example?.toLowerCase().includes(normalizedQuery) ?? false) ||
      (item.tags?.some((tag) => tag.toLowerCase().includes(normalizedQuery)) ??
        false)
    );
  });

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  const confirmWordDelete = (item: VocabularyItem) => {
    if (window.confirm(`Supprimer « ${item.word} » de cette liste ?`)) {
      onDeleteWord(item.id);
    }
  };

  return (
    <section className="detail" aria-labelledby="detail-title">
      <div className="mobile-back">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack}>
          Listes
        </Button>
      </div>

      <header className="detail-header">
        <div className="detail-title">
          <p className="eyebrow">{list.language || "Vocabulaire"}</p>
          <h1 id="detail-title">{list.title}</h1>
        </div>
        <div className="header-actions">
          {canEdit ? (
            <IconButton label="Partager la liste" onClick={onShareList}>
              <Share2 size={18} />
            </IconButton>
          ) : null}
          {hasWords ? (
            <IconButton label="Réinitialiser la progression" onClick={onResetProgress}>
              <RotateCcw size={18} />
            </IconButton>
          ) : null}
          {canEdit ? (
            <>
              <IconButton label="Modifier la liste" onClick={onEditList}>
                <Pencil size={18} />
              </IconButton>
              <IconButton
                label="Supprimer la liste"
                variant="danger"
                onClick={onDeleteList}
              >
                <Trash2 size={18} />
              </IconButton>
            </>
          ) : null}
        </div>
      </header>

      <ProgressSummary items={list.items} />

      {hasWords && dueCount === 0 ? (
        <p className="muted">Rien à revoir pour le moment — vous êtes à jour</p>
      ) : null}

      <div
        className="inline-actions quiz-direction-toggle"
        role="group"
        aria-label="Sens des questions"
      >
        <Button
          size="sm"
          variant={direction === "forward" ? "primary" : "ghost"}
          aria-pressed={direction === "forward"}
          onClick={() => onDirectionChange("forward")}
        >
          Mot → Traduction
        </Button>
        <Button
          size="sm"
          variant={direction === "reverse" ? "primary" : "ghost"}
          aria-pressed={direction === "reverse"}
          onClick={() => onDirectionChange("reverse")}
        >
          Traduction → Mot
        </Button>
      </div>

      {/* One entry point for the "test" mode, not two. "Review (n)" and
          "Test me" both dispatched onStartQuiz("test") and were shown side by
          side whenever anything was due — two buttons, one behaviour. The label
          now just reflects whether there is anything due. What each mode
          actually does is explained in the <details> below rather than in a
          `title`: a title would win the accessible-name computation, so each
          button would announce its whole description instead of its label. */}
      <div className="mode-grid" aria-label="Modes d'étude">
        <Button
          icon={dueCount > 0 ? <Clock size={18} /> : <ClipboardCheck size={18} />}
          onClick={() => onStartQuiz("test")}
          disabled={!hasWords}
        >
          {dueCount > 0 ? `Réviser (${dueCount})` : "Me tester"}
        </Button>
        <Button
          variant="secondary"
          icon={<Layers size={18} />}
          onClick={onStartFlashcards}
          disabled={!hasWords}
        >
          Cartes mémo
        </Button>
        <Button
          variant="secondary"
          icon={<Brain size={18} />}
          onClick={() => onStartQuiz("written")}
          disabled={!hasWords}
        >
          Quiz écrit
        </Button>
        <Button
          variant="secondary"
          icon={<ListChecks size={18} />}
          onClick={() => onStartQuiz("choice")}
          disabled={!hasChoiceSet}
        >
          Choix multiple
        </Button>
        <Button
          variant="secondary"
          icon={<Shuffle size={18} />}
          onClick={() => onStartQuiz("mixed")}
          disabled={!hasChoiceSet}
        >
          Test mixte
        </Button>
        <Button
          variant="secondary"
          icon={<BookOpen size={18} />}
          onClick={() => onStartQuiz("full-review")}
          disabled={!hasWords}
        >
          Révision complète
        </Button>
      </div>

      {/* A disabled button with no explanation is just inert, and a tooltip
          would not help: browsers do not reliably show `title` on disabled
          elements. */}
      {hasWords && !hasChoiceSet ? (
        <p className="muted">
          Les modes à choix multiple demandent au moins quatre réponses
          différentes dans la liste, du côté interrogé.
        </p>
      ) : null}

      {/* Nothing used to say what these modes do, which is the first thing a
          newcomer asks. Collapsed by default so it costs no room, and a native
          <details> needs no JavaScript and is keyboard-accessible. */}
      <details className="mode-help">
        <summary>À quoi correspond chaque mode ?</summary>
        <dl>
          <dt>{dueCount > 0 ? "Réviser" : "Me tester"}</dt>
          <dd>
            Interroge en priorité les mots à revoir aujourd&rsquo;hui, puis ceux
            que vous n&rsquo;avez pas encore acquis.
          </dd>
          <dt>Cartes mémo</dt>
          <dd>
            Des cartes à retourner : glissez vers la droite si c&rsquo;est
            acquis, vers la gauche si c&rsquo;est à revoir.
          </dd>
          <dt>Quiz écrit</dt>
          <dd>
            Vous tapez la réponse. Les accents et les petites fautes de frappe
            sont tolérés.
          </dd>
          <dt>Choix multiple</dt>
          <dd>Vous choisissez parmi quatre réponses proposées.</dd>
          <dt>Test mixte</dt>
          <dd>
            Alterne choix multiple et réponse à taper d&rsquo;une question à
            l&rsquo;autre.
          </dd>
          <dt>Révision complète</dt>
          <dd>
            Passe toute la liste dans un ordre aléatoire, sans tenir compte des
            échéances.
          </dd>
        </dl>
        <p className="muted">
          Le sens des questions ci-dessus (mot → traduction, ou l&rsquo;inverse)
          est mémorisé pour cette liste.
        </p>
      </details>

      <TestHistory entries={list.testHistory} items={list.items} onReview={onReviewTest} />

      <section className="word-section" aria-labelledby="words-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Termes</p>
            <h2 id="words-heading">Mots</h2>
          </div>
          {canEdit ? (
            <Button size="sm" icon={<Plus size={17} />} onClick={onAddWord}>
              Ajouter un mot
            </Button>
          ) : null}
        </div>

        {list.items.length ? (
          <>
            <input
              type="search"
              aria-label="Rechercher un mot"
              placeholder="Rechercher un mot"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div
              className="inline-actions"
              role="group"
              aria-label="Filtrer les mots par statut"
            >
              {STATUS_FILTERS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={statusFilter === option.value ? "primary" : "ghost"}
                  aria-pressed={statusFilter === option.value}
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {isFiltering ? (
              <p className="muted">
                {visibleItems.length} {visibleItems.length <= 1 ? "mot" : "mots"} sur{" "}
                {list.items.length}
              </p>
            ) : null}
            {visibleItems.length ? (
              <>
                <div className="word-list">
                  {visibleItems.map((item) => (
                    <article className="word-row" key={item.id}>
                      <div className="word-copy">
                        <div className="word-pair">
                          <div className="word-side">
                            <strong>{item.word}</strong>
                            {speakButton(item.word, speechLangs.word)}
                          </div>
                          <div className="word-side">
                            <span>{item.translation}</span>
                            {speakButton(item.translation, speechLangs.translation)}
                          </div>
                        </div>
                        {item.note ? (
                          <p className="muted word-note" dir="auto">
                            {item.note}
                          </p>
                        ) : null}
                        {item.example ? (
                          <p className="muted word-note word-example" dir="auto">
                            {item.example}
                          </p>
                        ) : null}
                        {item.tags?.length ? (
                          <div className="tag-chips">
                            {item.tags.map((tag) => (
                              <span className="tag-chip" key={tag} dir="auto">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="word-controls">
                        <StatusBadge status={item.status} />
                        {canEdit ? (
                          <div className="inline-actions">
                            <IconButton
                              label={`Modifier ${item.word}`}
                              onClick={() => onEditWord(item)}
                            >
                              <Pencil size={16} />
                            </IconButton>
                            <IconButton
                              label={`Supprimer ${item.word}`}
                              variant="danger"
                              onClick={() => confirmWordDelete(item)}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
                {canEdit ? (
                  <div className="word-list-actions">
                    <Button
                      variant="secondary"
                      icon={<Plus size={18} />}
                      onClick={onAddWord}
                    >
                      Ajouter un mot
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-state">
                <Search size={28} />
                <h3>Aucun mot ne correspond</h3>
                <p className="muted">Essayez une autre recherche, ou effacez les filtres.</p>
                <Button variant="secondary" onClick={clearFilters}>
                  Effacer les filtres
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <BookOpen size={28} />
            <h3>Aucun mot dans cette liste</h3>
            {canEdit ? (
              <>
                <p className="muted">
                  Ajoutez des mots ici pour commencer à l&rsquo;étudier.
                </p>
                <Button icon={<Plus size={18} />} onClick={onAddWord}>
                  Ajouter un mot
                </Button>
              </>
            ) : (
              <p className="muted">
                Cette liste est arrivée vide avec l&rsquo;application.
                Signalez-le avec &laquo;&nbsp;Donner mon avis&nbsp;&raquo;.
              </p>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
