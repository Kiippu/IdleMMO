// Display helpers shared with the engine (gear overhaul 2026-11-13). Use these for every work effect and fight stat
// the player sees, so numbers read the same in every panel:
//   fmtEffect(1, 'pct') → "+1.0%", fmtEffect(0.25) → "+0.25%", fmtEffect(2, 'pts') → "+2.0"  (>= 1: 1 decimal, < 1: 2)
//   statText('atk', 47) → "Attack +47", statText('fire', 3.3) → "Fire damage +3.3%", statText('ward_frost', 2) → "Frost resistance +2.0%"
//   fmtHpNow(0.6) → "1", fmtHpTotal(137.4) → "137", fmtHpAmount(0.2) → "0.2", fmtHpAmount(17.4) → "17", fmtHpDelta(-3.6) → "−3.6"
export { fmtEffect, fmtEffectNum, effectShown, statText, fmtHpNow, fmtHpTotal, fmtHpAmount, fmtHpDelta, plural } from '@guildwright/engine';
