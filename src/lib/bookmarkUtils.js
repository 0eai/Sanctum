export const normalizeUrl = (url) => {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
};

export const getDomain = (url) => {
  try { return new URL(normalizeUrl(url)).hostname.replace('www.', ''); } 
  catch (e) { return 'link'; }
};

export const parseNetscapeHtml = (htmlContent) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  return doc.querySelector('dl');
};