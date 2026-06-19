function parseVersion(value) {
  const normalized = String(value || "").trim().replace(/^v/i, "").split("+", 1)[0];
  const [core, prerelease = ""] = normalized.split("-", 2);
  const parts = core.split(".");
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Versión inválida: ${value}`);
  }

  return {
    parts: parts.map(Number),
    prerelease: prerelease ? prerelease.split(".") : []
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;

    const leftNumeric = /^\d+$/.test(left[index]);
    const rightNumeric = /^\d+$/.test(right[index]);
    if (leftNumeric && rightNumeric) return Number(left[index]) > Number(right[index]) ? 1 : -1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left[index].localeCompare(right[index]);
  }
  return 0;
}

function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  const length = Math.max(left.parts.length, right.parts.length, 3);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left.parts[index] || 0;
    const rightPart = right.parts[index] || 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

function isStrictlyNewer(candidate, installed) {
  try {
    return compareVersions(candidate, installed) > 0;
  } catch {
    return false;
  }
}

function shouldOfferUpdate(updateCheck, installed) {
  return Boolean(updateCheck?.isUpdateAvailable)
    && isStrictlyNewer(updateCheck?.updateInfo?.version, installed);
}

module.exports = { compareVersions, isStrictlyNewer, shouldOfferUpdate };
