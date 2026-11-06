/** What the address field holds, as a URL: a scheme kept, a host given https (http for this machine), else a search. */
export const toUrl = (input: string): string => {
  const text = input.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^/:]+:\d+(\/|$)/.test(text)) return text;
  if (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/i.test(text)) return `http://${text}`;
  if (!/\s/.test(text) && /^[^/?#]+\.[a-z]{2,}(:\d+)?([/?#]|$)/i.test(text)) return `https://${text}`;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
};
