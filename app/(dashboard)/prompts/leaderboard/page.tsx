'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface PromptVersion {
  id: string;
  doc_type: string;
  model: string;
  prompt_type: string;
  version_number: number;
  prompt_content: string;
  accuracy_score?: number;
  golden_set_accuracy?: number;
  total_fields_tested?: number;
  correct_fields?: number;
  regression_count?: number;
  status?: string;
  is_active: boolean;
  evolution_reason?: string;
  created_at: string;
  golden_set_run_at?: string;
}

interface LeaderboardGroup {
  doc_type: string;
  model: string;
  prompt_type: string;
  active: PromptVersion | null;
  candidates: PromptVersion[];
  deprecated: PromptVersion[];
}

export default function PromptLeaderboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [leaderboards, setLeaderboards] = useState<LeaderboardGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<LeaderboardGroup | null>(null);
  const [diffVersion1, setDiffVersion1] = useState<string | null>(null);
  const [diffVersion2, setDiffVersion2] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session?.user?.email !== 'condor') {
      router.push('/dashboard');
      return;
    }
    fetchLeaderboard();
  }, [session, router]);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/prompts/leaderboard');
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }
      const data = await response.json();
      setLeaderboards(data.leaderboards || []);
    } catch (err: any) {
      setError(err.message || 'Error loading leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchDiff = async (version1Id: string, version2Id: string) => {
    try {
      const response = await fetch(`/api/prompts/versions/${version1Id}/diff?compare_with=${version2Id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch diff');
      }
      const data = await response.json();
      setDiffData(data);
    } catch (err: any) {
      setError(err.message || 'Error loading diff');
    }
  };

  const formatAccuracy = (score?: number) => {
    if (score === null || score === undefined) return 'N/A';
    return `${(score * 100).toFixed(2)}%`;
  };

  const getStatusBadge = (version: PromptVersion) => {
    if (version.is_active && version.status === 'active') {
      return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded font-semibold">✓ ACTIVE</span>;
    }
    if (version.status === 'pending') {
      return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">⏳ PENDING</span>;
    }
    if (version.status === 'rejected') {
      return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">✗ REJECTED</span>;
    }
    if (version.status === 'deprecated') {
      return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">📦 DEPRECATED</span>;
    }
    return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">Unknown</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-600">Cargando leaderboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Prompt Leaderboard</h1>
          <p className="text-gray-600 mt-2">
            Versiones de prompts y métricas de rendimiento
          </p>
        </div>
        <Link href="/dashboard">
          <Button variant="secondary">Volver al Dashboard</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {leaderboards.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-600">
            No hay versiones de prompts disponibles aún.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {leaderboards.map((group, idx) => (
            <Card key={idx} className="p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {group.doc_type} / {group.model} / {group.prompt_type}
                </h2>
              </div>

              {/* King of the Hill - Active Version */}
              {group.active && (
                <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-gray-900">
                        👑 Version {group.active.version_number} (ACTIVE)
                      </h3>
                      {getStatusBadge(group.active)}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-700">
                        {formatAccuracy(group.active.golden_set_accuracy || group.active.accuracy_score)}
                      </div>
                      <div className="text-xs text-gray-600">Accuracy</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Golden Set:</span>{' '}
                      <span className="font-semibold">
                        {formatAccuracy(group.active.golden_set_accuracy)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Backtest:</span>{' '}
                      <span className="font-semibold">
                        {formatAccuracy(group.active.accuracy_score)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Regressions:</span>{' '}
                      <span className="font-semibold">
                        {group.active.regression_count || 0}
                      </span>
                    </div>
                  </div>
                  {group.active.evolution_reason && (
                    <div className="mt-3 text-xs text-gray-600">
                      <strong>Evolution Reason:</strong>{' '}
                      {typeof group.active.evolution_reason === 'string' 
                        ? group.active.evolution_reason 
                        : JSON.stringify(group.active.evolution_reason)}
                    </div>
                  )}
                </div>
              )}

              {/* Challenger List - Candidates */}
              {group.candidates.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-md font-semibold text-gray-700 mb-3">
                    🏆 Challengers (Pending Promotion)
                  </h3>
                  <div className="space-y-3">
                    {group.candidates.map((candidate) => (
                      <div
                        key={candidate.id}
                        className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-900">
                              Version {candidate.version_number}
                            </span>
                            {getStatusBadge(candidate)}
                            {group.active && (
                              <button
                                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                                onClick={() => {
                                  setDiffVersion1(candidate.id);
                                  setDiffVersion2(group.active!.id);
                                  fetchDiff(candidate.id, group.active!.id);
                                }}
                              >
                                Compare with Active
                              </button>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-yellow-700">
                              {formatAccuracy(candidate.golden_set_accuracy || candidate.accuracy_score)}
                            </div>
                            <div className="text-xs text-gray-600">Accuracy</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Golden Set:</span>{' '}
                            <span className="font-semibold">
                              {formatAccuracy(candidate.golden_set_accuracy)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Backtest:</span>{' '}
                            <span className="font-semibold">
                              {formatAccuracy(candidate.accuracy_score)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Regressions:</span>{' '}
                            <span className="font-semibold text-red-600">
                              {candidate.regression_count || 0}
                            </span>
                          </div>
                        </div>
                        {candidate.evolution_reason && (
                          <div className="mt-2 text-xs text-gray-600">
                            <strong>Evolution Reason:</strong>{' '}
                            {typeof candidate.evolution_reason === 'string' 
                              ? candidate.evolution_reason 
                              : JSON.stringify(candidate.evolution_reason)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deprecated Versions */}
              {group.deprecated.length > 0 && (
                <div>
                  <h3 className="text-md font-semibold text-gray-700 mb-3">
                    📦 Deprecated Versions
                  </h3>
                  <div className="space-y-2">
                    {group.deprecated.slice(0, 5).map((deprecated) => (
                      <div
                        key={deprecated.id}
                        className="p-3 bg-gray-50 border border-gray-200 rounded text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-gray-700">
                              Version {deprecated.version_number}
                            </span>
                            {getStatusBadge(deprecated)}
                          </div>
                          <div className="text-gray-600">
                            {formatAccuracy(deprecated.golden_set_accuracy || deprecated.accuracy_score)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {group.deprecated.length > 5 && (
                      <div className="text-sm text-gray-500 text-center">
                        ... y {group.deprecated.length - 5} versiones más
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Diff Modal */}
      {diffData && diffVersion1 && diffVersion2 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Diff: Version {diffData.version1.version_number} vs Version {diffData.version2.version_number}
              </h3>
              <Button variant="secondary" onClick={() => {
                setDiffData(null);
                setDiffVersion1(null);
                setDiffVersion2(null);
              }}>
                Cerrar
              </Button>
            </div>
            <div className="space-y-2 font-mono text-sm">
              {diffData.diff.map((part: any, idx: number) => (
                <div key={idx}>
                  {part.lines.map((line: any, lineIdx: number) => (
                    <div
                      key={lineIdx}
                      className={`${
                        part.type === 'added'
                          ? 'bg-green-100 text-green-900'
                          : part.type === 'removed'
                          ? 'bg-red-100 text-red-900'
                          : 'bg-gray-50 text-gray-700'
                      } px-2 py-0.5`}
                    >
                      <span className="text-gray-500 mr-2">
                        {part.type === 'added' ? '+' : part.type === 'removed' ? '-' : ' '}
                      </span>
                      {line.content}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

