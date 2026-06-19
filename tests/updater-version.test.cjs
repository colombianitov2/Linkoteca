const test = require("node:test");
const assert = require("node:assert/strict");
const { compareVersions, isStrictlyNewer, shouldOfferUpdate } = require("../electron/version.cjs");

test("la misma versión nunca se considera una actualización", () => {
  assert.equal(isStrictlyNewer("1.0.2", "1.0.2"), false);
  assert.equal(isStrictlyNewer("v1.0.2", "1.0.2"), false);
  assert.equal(isStrictlyNewer("1.0.2+build.8", "1.0.2"), false);
});

test("solo una versión estrictamente superior se puede actualizar", () => {
  assert.equal(isStrictlyNewer("1.0.3", "1.0.2"), true);
  assert.equal(isStrictlyNewer("1.1.0", "1.0.9"), true);
  assert.equal(isStrictlyNewer("1.0.1", "1.0.2"), false);
});

test("una versión previa es menor que la versión estable equivalente", () => {
  assert.equal(compareVersions("1.0.3-beta.1", "1.0.3"), -1);
  assert.equal(compareVersions("1.0.3", "1.0.3-beta.1"), 1);
});

test("una versión inválida nunca habilita la actualización", () => {
  assert.equal(isStrictlyNewer("release-reciente", "1.0.2"), false);
});

test("se rechaza una falsa actualización a la misma versión", () => {
  const incorrectExternalResult = {
    isUpdateAvailable: true,
    updateInfo: { version: "1.0.2" }
  };
  assert.equal(shouldOfferUpdate(incorrectExternalResult, "1.0.2"), false);
});

test("se acepta el resultado externo únicamente si la versión es superior", () => {
  const validExternalResult = {
    isUpdateAvailable: true,
    updateInfo: { version: "1.0.3" }
  };
  assert.equal(shouldOfferUpdate(validExternalResult, "1.0.2"), true);
});
