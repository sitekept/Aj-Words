"use client";

export function AJWordsScene() {
  return (
    <div className="aj-scene" aria-hidden="true">
      <div className="aj-scene-card aj-scene-card-back" />
      <div className="aj-scene-card aj-scene-card-mid" />
      <div className="aj-scene-card aj-scene-card-front">
        <span className="aj-scene-line aj-scene-line-primary" />
        <span className="aj-scene-line aj-scene-line-accent" />
        <span className="aj-scene-letter aj-scene-letter-a">A</span>
        <span className="aj-scene-letter aj-scene-letter-j">J</span>
      </div>
    </div>
  );
}
