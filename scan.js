
function present(result, locale) {
  const de = locale === 'de';
  return {
    host: new URL(result.normalizedTarget).hostname, scannedUrl: result.normalizedTarget,
    score: result.score, engine: `AgentReady ${result.agentreadyVersion}`, profile: result.profile,
    source: 'AgentReady passive HTTP scan',
    summary: de
      ? 'AgentReady-Alpha-Score aus passiven HTTP-Prüfungen. Kein Nachweis erfolgreicher Agentenaktionen oder KI-Sichtbarkeit. Unbekannt und nicht anwendbar sind keine fehlgeschlagenen Prüfungen. Originalbefunde sind auf Englisch.'
      : 'AgentReady alpha score from passive HTTP checks. Not proof of successful agent actions or AI visibility. Unknown and not applicable are not failed checks.',
    checks: result.findings.map((finding) => ({ ...finding, label: finding.title, passed: finding.status === 'pass', informational: ['info', 'unknown', 'not_applicable'].includes(finding.status) })),
    agentready: result
  };
}
module.exports = require('./lib/scan-handler').createHandler({ demo: true, present });
module.exports.present = present;
