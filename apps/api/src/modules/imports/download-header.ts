export function attachmentContentDisposition(filename: string): string {
  const safeName = filename.replace(/[/"\\\r\n]/g, "_");
  const asciiFallback = [...safeName]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x20 && code <= 0x7e ? character : "_";
    })
    .join("");
  const encoded = encodeURIComponent(safeName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback || "inventory"}"; filename*=UTF-8''${encoded}`;
}
