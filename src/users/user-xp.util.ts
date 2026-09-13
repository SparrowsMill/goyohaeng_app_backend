export const XP_PER_LEVEL = 100;

export function calculateXpProgress(
  currentLevel: number,
  currentXp: number,
  gainedXp: number,
): {
  level: number;
  xp: number;
} {
  const totalXp =
    currentXp + gainedXp;

  const gainedLevels =
    Math.floor(
      totalXp / XP_PER_LEVEL,
    );

  return {
    level:
      currentLevel +
      gainedLevels,

    xp:
      totalXp %
      XP_PER_LEVEL,
  };
}