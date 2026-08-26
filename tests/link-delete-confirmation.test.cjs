const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `No se encontró ${startMarker}`);
  assert.notEqual(end, -1, `No se encontró ${endMarker}`);
  return source.slice(start, end);
}

function assertLinkDeletionHasNoConfirmation(source, selectedMarker) {
  const deleteLink = sectionBetween(source, "async function deleteLink", selectedMarker);
  assert.doesNotMatch(deleteLink, /\b(?:window\.)?confirm\s*\(/);
  assert.doesNotMatch(deleteLink, /¿Borrar este enlace|¿Eliminar este enlace definitivamente/);
}

test("el borrado de enlaces no confirma y grupos y carpetas sí conservan confirmación", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assertLinkDeletionHasNoConfirmation(source, "async function deleteSelectedLinks");

  const deleteSelectedLinks = sectionBetween(source, "async function deleteSelectedLinks", "async function restoreLink");
  assert.doesNotMatch(deleteSelectedLinks, /\b(?:window\.)?confirm\s*\(/);
  assert.doesNotMatch(deleteSelectedLinks, /¿Borrar este enlace|¿Eliminar este enlace definitivamente/);

  const deleteGroup = sectionBetween(source, "async function deleteGroup", "async function restoreGroup");
  const deleteCategory = sectionBetween(source, "async function deleteCategory", "async function restoreCategory");
  assert.match(deleteGroup, /window\.confirm\s*\(message\)/);
  assert.match(deleteCategory, /window\.confirm\s*\(message\)/);
});
