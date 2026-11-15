// Traversal reads handles only; no music bytes are stored or changed.
export const readOptions = Object.freeze({ mode: 'read' });
export async function ensureReadPermission(handle, request = false) {
  return (await handle[request ? 'requestPermission' : 'queryPermission'](readOptions)) === 'granted';
}
export async function scanDirectory(root) {
  const library = { folders: [], members: [] };
  const visit = async (directory, path) => {
    if (path) library.folders.push(path);
    for await (const entry of directory.values()) {
      const relative = path ? `${path}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') await visit(entry, relative);
      else if (/\.mp3$/i.test(entry.name)) library.members.push({ id: relative, name: entry.name, folder: path, handle: entry });
    }
  };
  await visit(root, '');
  if (library.members.some(item => item.folder === '')) library.folders.push('');
  return library;
}
