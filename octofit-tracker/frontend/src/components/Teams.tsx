import { useEffect, useState } from 'react';
import { getJson } from '../api/client.js';

type Team = { name: string; members: string[] | { _id?: string; toString?(): string }[] };

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ teams: Team[] }>('/api/teams')
      .then((data) => {
        setTeams(data.teams);
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
        <h2 className="h4">Teams</h2>
        <p>Manage teams and members.</p>
        {loading && <p role="status">Loading...</p>}
        {error && <p role="alert">Unable to load teams: {error}</p>}
        {!loading && !error && teams.length === 0 && <p>No teams created yet.</p>}
        {!loading && !error && teams.length > 0 && (
          <div className="list-group">
            {teams.map((team, idx) => (
              <div key={idx} className="list-group-item">
                <h3 className="h6">{team.name}</h3>
                <p className="mb-0">
                  Members: {team.members && team.members.length > 0 ? team.members.join(', ') : 'None'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
