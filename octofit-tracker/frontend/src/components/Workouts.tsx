import { useEffect, useState } from 'react';
import { getJson } from '../api/client.js';

type Suggestion = { title: string; focus?: string; minutes?: number; difficulty?: string; reason: string };

export default function Workouts() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ suggestions: Suggestion[] }>('/api/workouts/suggestions/mona%40example.com')
      .then((data) => {
        setSuggestions(data.suggestions);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  return (
    <section className="card h-100">
      <div className="card-body">
        <h2 className="h4">Workout suggestions</h2>
        <p>Recommend workouts from activity patterns.</p>
        {loading && <p role="status">Loading...</p>}
        {error && <p role="alert">Unable to load workout suggestions: {error}</p>}
        {!loading && !error && suggestions.length === 0 && <p>No workout suggestions available.</p>}
        {!loading && !error && suggestions.length > 0 && (
          <div className="list-group">
            {suggestions.map((suggestion, idx) => (
              <div key={idx} className="list-group-item">
                <h3 className="h6">{suggestion.title}</h3>
                <p className="mb-1">
                  {suggestion.focus && <span>Focus: {suggestion.focus} | </span>}
                  {suggestion.minutes && <span>Duration: {suggestion.minutes} min | </span>}
                  {suggestion.difficulty && <span>Difficulty: {suggestion.difficulty}</span>}
                </p>
                <p className="mb-0 text-muted">{suggestion.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
