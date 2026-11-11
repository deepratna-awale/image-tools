// Passes an image from one tool's result to the next tool the user opens. Kept in memory:
// the site navigates between tools without reloading, so the file is still here.
let pending: File | null = null;

export function handOff(file: File) {
  pending = file;
}

/** The handed-over file, once */
export function takeHandoff(): File | null {
  const file = pending;
  pending = null;
  return file;
}
