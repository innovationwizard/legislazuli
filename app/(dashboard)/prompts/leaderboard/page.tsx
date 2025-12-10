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
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatorCandidate, setSimulatorCandidate] = useState<PromptVersion | null>(null);
  const [simulatorSystemId, setSimulatorSystemId] = useState<string | null>(null);
  const [simulatorUserId, setSimulatorUserId] = useState<string | null>(null);
  const [simulatorGroup, setSimulatorGroup] = useState<LeaderboardGroup | null>(null);
  const [simulatorActiveResult, setSimulatorActiveResult] = useState<any>(null);
  const [simulatorCandidateResult, setSimulatorCandidateResult] = useState<any>(null);
  const [simulatorLoading, setSimulatorLoading] = useState(false);
  const [simulatorFile, setSimulatorFile] = useState<File | null>(null);
  const [simulatorFailureDocs, setSimulatorFailureDocs] = useState<any[]>([]);

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

  const openSimulator = (candidate: PromptVersion, systemId: string, userId: string, group: LeaderboardGroup) => {
    setSimulatorCandidate(candidate);
    setSimulatorSystemId(systemId);
    setSimulatorUserId(userId);
    setSimulatorGroup(group);
    setSimulatorOpen(true);
    setSimulatorActiveResult(null);
    setSimulatorCandidateResult(null);
    setSimulatorFile(null);
    fetchFailureDocs();
  };

  const fetchFailureDocs = async () => {
    try {
      const response = await fetch('/api/golden-set/failures');
      if (response.ok) {
        const data = await response.json();
        setSimulatorFailureDocs(data.documents || []);
      }
    } catch (err) {
      console.error('Error fetching failure docs:', err);
    }
  };

  const runSimulation = async () => {
    if (!simulatorFile || !simulatorSystemId || !simulatorUserId || !simulatorGroup) return;

    setSimulatorLoading(true);
    setError('');

    try {
      // First, get active result
      const activeSystemVersion = simulatorGroup.active;
      if (!activeSystemVersion) {
        throw new Error('No active version found');
      }

      // Find active system and user versions
      const systemGroup = leaderboards.find(
        g => g.doc_type === simulatorGroup.doc_type && 
        g.model === simulatorGroup.model && 
        g.prompt_type === 'system'
      );
      const userGroup = leaderboards.find(
        g => g.doc_type === simulatorGroup.doc_type && 
        g.model === simulatorGroup.model && 
        g.prompt_type === 'user'
      );

      const activeSystem = systemGroup?.active;
      const activeUser = userGroup?.active;

      if (!activeSystem || !activeUser) {
        throw new Error('Active versions not found');
      }

      // Run active extraction
      const activeFormData = new FormData();
      activeFormData.append('file', simulatorFile);
      activeFormData.append('systemPromptVersionId', activeSystem.id);
      activeFormData.append('userPromptVersionId', activeUser.id);
      activeFormData.append('modelProvider', simulatorGroup.model);

      const activeResponse = await fetch('/api/extract/simulate', {
        method: 'POST',
        body: activeFormData,
      });

      if (!activeResponse.ok) {
        throw new Error('Active extraction failed');
      }
      const activeData = await activeResponse.json();
      setSimulatorActiveResult(activeData.result);

      // Run candidate extraction
      const candidateFormData = new FormData();
      candidateFormData.append('file', simulatorFile);
      candidateFormData.append('systemPromptVersionId', simulatorSystemId);
      candidateFormData.append('userPromptVersionId', simulatorUserId);
      candidateFormData.append('modelProvider', simulatorGroup.model);

      const candidateResponse = await fetch('/api/extract/simulate', {
        method: 'POST',
        body: candidateFormData,
      });

      if (!candidateResponse.ok) {
        throw new Error('Candidate extraction failed');
      }
      const candidateData = await candidateResponse.json();
      setSimulatorCandidateResult(candidateData.result);
    } catch (err: any) {
      setError(err.message || 'Simulation failed');
    } finally {
      setSimulatorLoading(false);
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
                            <div className="flex gap-2">
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
                              <button
                                className="px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors font-semibold"
                                onClick={() => {
                                  // Find system and user prompt versions for this candidate
                                  // They should have the same version_number
                                  const systemGroup = leaderboards.find(
                                    g => g.doc_type === group.doc_type && 
                                    g.model === group.model && 
                                    g.prompt_type === 'system'
                                  );
                                  const userGroup = leaderboards.find(
                                    g => g.doc_type === group.doc_type && 
                                    g.model === group.model && 
                                    g.prompt_type === 'user'
                                  );
                                  
                                  let systemVersionId: string | null = null;
                                  let userVersionId: string | null = null;
                                  
                                  if (group.prompt_type === 'system') {
                                    systemVersionId = candidate.id;
                                    // Find matching user version by version_number
                                    const matchingUser = userGroup?.candidates.find(
                                      v => v.version_number === candidate.version_number
                                    );
                                    if (matchingUser) {
                                      userVersionId = matchingUser.id;
                                    }
                                  } else {
                                    userVersionId = candidate.id;
                                    // Find matching system version by version_number
                                    const matchingSystem = systemGroup?.candidates.find(
                                      v => v.version_number === candidate.version_number
                                    );
                                    if (matchingSystem) {
                                      systemVersionId = matchingSystem.id;
                                    }
                                  }
                                  
                                  if (systemVersionId && userVersionId) {
                                    openSimulator(candidate, systemVersionId, userVersionId, group);
                                  } else {
                                    setError('Could not find matching system and user prompt versions');
                                  }
                                }}
                              >
                                🧪 Simulate
                              </button>
                            </div>
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

      {/* Simulator Modal */}
      {simulatorOpen && simulatorCandidate && simulatorGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-7xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                🧪 Simulator: Version {simulatorCandidate.version_number} vs Active
              </h3>
              <Button variant="secondary" onClick={() => {
                setSimulatorOpen(false);
                setSimulatorCandidate(null);
                setSimulatorSystemId(null);
                setSimulatorUserId(null);
                setSimulatorGroup(null);
                setSimulatorActiveResult(null);
                setSimulatorCandidateResult(null);
                setSimulatorFile(null);
              }}>
                Cerrar
              </Button>
            </div>

            {/* File Input Section */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Document for Testing
              </label>
              <div className="flex gap-4">
                <div className="flex-1">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSimulatorFile(file);
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Or select from Golden Set Failures:
                  </label>
                  <select
                    className="block w-full text-sm border-gray-300 rounded-md"
                    onChange={(e) => {
                      const docId = e.target.value;
                      if (docId) {
                        // TODO: Fetch document file from storage
                        // For now, user must upload manually
                      }
                    }}
                  >
                    <option value="">Select a failure case...</option>
                    {simulatorFailureDocs.map((doc: any) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.filename} ({doc.doc_type})
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={runSimulation}
                  disabled={!simulatorFile || simulatorLoading}
                >
                  {simulatorLoading ? 'Running...' : 'Run Simulation'}
                </Button>
              </div>
            </div>

            {/* Results: Split Screen with Diff Focusing */}
            {simulatorActiveResult && simulatorCandidateResult && (
              <div className="space-y-4">
                {/* Diff Focus Toggle */}
                <div className="flex items-center gap-2 p-2 bg-gray-100 rounded">
                  <input
                    type="checkbox"
                    id="diffFocus"
                    defaultChecked={true}
                    onChange={(e) => {
                      const showAll = !e.target.checked;
                      const checkboxes = document.querySelectorAll('.diff-field');
                      checkboxes.forEach((cb: any) => {
                        if (showAll) {
                          cb.closest('.diff-row')?.classList.remove('opacity-30');
                        } else {
                          const isDifferent = cb.dataset.different === 'true';
                          if (!isDifferent) {
                            cb.closest('.diff-row')?.classList.add('opacity-30');
                          }
                        }
                      });
                    }}
                    className="rounded"
                  />
                  <label htmlFor="diffFocus" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Show only differences (dim identical fields)
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Active Result */}
                  <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                    <h4 className="font-bold text-green-800 mb-3">
                      ✅ Active Version {simulatorGroup.active?.version_number || 'N/A'}
                    </h4>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {Object.entries(simulatorActiveResult).map(([key, value]) => {
                        const candidateValue = (simulatorCandidateResult as any)[key];
                        const activeStr = String(value || '[empty]').trim();
                        const candidateStr = String(candidateValue || '[empty]').trim();
                        const isDifferent = activeStr !== candidateStr;
                        return (
                          <div
                            key={key}
                            className={`diff-row p-2 rounded text-sm transition-opacity ${
                              isDifferent 
                                ? 'bg-yellow-100 border-2 border-yellow-400 shadow-sm' 
                                : 'bg-white border border-gray-200'
                            }`}
                          >
                            <div className="font-semibold text-gray-700">{key}:</div>
                            <div className={`text-gray-900 ${isDifferent ? 'font-medium' : ''}`}>
                              {activeStr}
                            </div>
                            <input
                              type="checkbox"
                              className="diff-field hidden"
                              data-different={isDifferent}
                              defaultChecked={true}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Candidate Result */}
                  <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
                    <h4 className="font-bold text-blue-800 mb-3">
                      🧪 Candidate Version {simulatorCandidate.version_number}
                    </h4>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {Object.entries(simulatorCandidateResult).map(([key, value]) => {
                        const activeValue = (simulatorActiveResult as any)[key];
                        const candidateStr = String(value || '[empty]').trim();
                        const activeStr = String(activeValue || '[empty]').trim();
                        const isDifferent = candidateStr !== activeStr;
                        return (
                          <div
                            key={key}
                            className={`diff-row p-2 rounded text-sm transition-opacity ${
                              isDifferent 
                                ? 'bg-yellow-100 border-2 border-yellow-400 shadow-sm' 
                                : 'bg-white border border-gray-200'
                            }`}
                          >
                            <div className="font-semibold text-gray-700">{key}:</div>
                            <div className={`text-gray-900 ${isDifferent ? 'font-medium' : ''}`}>
                              {candidateStr}
                            </div>
                            <input
                              type="checkbox"
                              className="diff-field hidden"
                              data-different={isDifferent}
                              defaultChecked={true}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Summary Stats */}
                {(() => {
                  const allKeys = new Set([
                    ...Object.keys(simulatorActiveResult),
                    ...Object.keys(simulatorCandidateResult),
                  ]);
                  let differentCount = 0;
                  let identicalCount = 0;
                  allKeys.forEach((key) => {
                    const activeStr = String((simulatorActiveResult as any)[key] || '[empty]').trim();
                    const candidateStr = String((simulatorCandidateResult as any)[key] || '[empty]').trim();
                    if (activeStr !== candidateStr) {
                      differentCount++;
                    } else {
                      identicalCount++;
                    }
                  });
                  return (
                    <div className="p-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex gap-4">
                        <span className="font-semibold text-yellow-700">
                          ⚠️ {differentCount} field{differentCount !== 1 ? 's' : ''} differ
                        </span>
                        <span className="text-gray-600">
                          ✓ {identicalCount} field{identicalCount !== 1 ? 's' : ''} identical
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

